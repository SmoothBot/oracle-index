import type { Address, Log } from "viem";
import { firstPartyStorkAbi, getConfig } from "@oracle-index/shared";
import { getHttpClient } from "./client.js";
import { decodeLogs } from "./decoder.js";
import {
  insertPriceUpdates,
  upsertDiscoveredAsset,
  getCheckpoint,
  updateCheckpoint,
  updateChainTip,
} from "./queries.js";
import { logger } from "./logger.js";

const blockTimestampCache = new Map<bigint, number>();

async function fetchBlockTimestamps(
  blockNumbers: bigint[],
): Promise<Map<bigint, number>> {
  const client = getHttpClient();
  const result = new Map<bigint, number>();
  const toFetch: bigint[] = [];

  for (const bn of blockNumbers) {
    const cached = blockTimestampCache.get(bn);
    if (cached !== undefined) {
      result.set(bn, cached);
    } else {
      toFetch.push(bn);
    }
  }

  // Fetch in batches of 100
  for (let i = 0; i < toFetch.length; i += 100) {
    const batch = toFetch.slice(i, i + 100);
    const blocks = await Promise.all(
      batch.map((bn) => client.getBlock({ blockNumber: bn })),
    );
    for (let j = 0; j < blocks.length; j++) {
      const ts = Number(blocks[j].timestamp);
      result.set(batch[j], ts);
      blockTimestampCache.set(batch[j], ts);
    }
  }

  // Evict old entries
  if (blockTimestampCache.size > 50_000) {
    const entries = [...blockTimestampCache.entries()];
    entries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    for (let i = 0; i < 25_000; i++) {
      blockTimestampCache.delete(entries[i][0]);
    }
  }

  return result;
}

export async function processLogs(logs: Log[]): Promise<void> {
  if (logs.length === 0) return;

  const blockNumbers = [...new Set(logs.map((l) => l.blockNumber!))];
  const timestamps = await fetchBlockTimestamps(blockNumbers);

  const decoded = decodeLogs(logs, timestamps);

  await insertPriceUpdates(decoded.priceUpdates);

  // Update discovery table
  const maxBlock = logs.reduce(
    (max, l) => (l.blockNumber! > max ? l.blockNumber! : max),
    0n,
  );
  for (const assetId of decoded.assetIds) {
    await upsertDiscoveredAsset(assetId, maxBlock);
  }
}

async function getLogsWithRetry(
  fromBlock: bigint,
  toBlock: bigint,
  retries = 3,
): Promise<Log[]> {
  const config = getConfig();
  const client = getHttpClient();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const logs = await client.getLogs({
        address: config.ORACLE_CONTRACT_ADDRESS as Address,
        fromBlock,
        toBlock,
        events: firstPartyStorkAbi,
      });
      return logs as Log[];
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Handle "query exceeds max results" by halving the block range
      if (errMsg.includes("max results") || errMsg.includes("query exceeds")) {
        if (toBlock > fromBlock) {
          const mid = fromBlock + (toBlock - fromBlock) / 2n;
          logger.info(
            { fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), mid: mid.toString() },
            "Result limit exceeded, halving range",
          );
          const first = await getLogsWithRetry(fromBlock, mid, retries);
          const second = await getLogsWithRetry(mid + 1n, toBlock, retries);
          return [...first, ...second];
        }
        // Single block still too many results - fetch it anyway with a single block range
        // This shouldn't happen but if it does, just return empty
        logger.warn({ block: fromBlock.toString() }, "Single block exceeds result limit");
        return [];
      }

      if (attempt === retries) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      logger.warn(
        { err: errMsg, fromBlock: fromBlock.toString(), attempt, delay },
        "getLogs failed, retrying",
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return [];
}

export async function backfill(): Promise<bigint> {
  const config = getConfig();
  const client = getHttpClient();

  const checkpoint = await getCheckpoint();
  if (checkpoint.isBackfillComplete) {
    logger.info(
      { lastBlock: checkpoint.lastBlock.toString() },
      "Backfill already complete",
    );
    return checkpoint.lastBlock;
  }

  const latestBlock = await client.getBlockNumber();
  await updateChainTip(latestBlock);

  // Use the higher of checkpoint or configured START_BLOCK
  let fromBlock = checkpoint.lastBlock >= config.START_BLOCK
    ? checkpoint.lastBlock + 1n
    : config.START_BLOCK;

  if (fromBlock > latestBlock) {
    await updateCheckpoint(latestBlock, true);
    return latestBlock;
  }

  const totalBlocks = latestBlock - fromBlock + 1n;
  logger.info(
    {
      fromBlock: fromBlock.toString(),
      toBlock: latestBlock.toString(),
      totalBlocks: totalBlocks.toString(),
      concurrency: config.BACKFILL_CONCURRENCY,
    },
    "Starting backfill",
  );

  const batchSize = BigInt(config.BATCH_SIZE);
  const concurrency = config.BACKFILL_CONCURRENCY;
  let totalEvents = 0;

  while (fromBlock <= latestBlock) {
    // Build up to `concurrency` batch ranges
    const batches: { from: bigint; to: bigint }[] = [];
    let cursor = fromBlock;
    for (let i = 0; i < concurrency && cursor <= latestBlock; i++) {
      const to = cursor + batchSize - 1n > latestBlock
        ? latestBlock
        : cursor + batchSize - 1n;
      batches.push({ from: cursor, to });
      cursor = to + 1n;
    }

    // Process all batches concurrently
    const results = await Promise.all(
      batches.map(async (batch) => {
        const logs = await getLogsWithRetry(batch.from, batch.to);
        if (logs.length > 0) {
          await processLogs(logs);
        }
        return logs.length;
      }),
    );

    const batchEvents = results.reduce((sum, n) => sum + n, 0);
    totalEvents += batchEvents;

    // Checkpoint to the highest completed block
    const lastBatch = batches[batches.length - 1];
    await updateCheckpoint(lastBatch.to);
    fromBlock = lastBatch.to + 1n;

    const rangeTotal = latestBlock - config.START_BLOCK + 1n;
    const progress = rangeTotal > 0n
      ? Number(((lastBatch.to - config.START_BLOCK) * 100n) / rangeTotal)
      : 100;
    logger.info(
      {
        fromBlock: batches[0].from.toString(),
        toBlock: lastBatch.to.toString(),
        batches: batches.length,
        events: batchEvents,
        totalEvents,
        progress: `${progress}%`,
      },
      "Backfill batch complete",
    );
  }

  await updateCheckpoint(latestBlock, true);
  logger.info({ totalEvents }, "Backfill complete");
  return latestBlock;
}
