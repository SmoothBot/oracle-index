import type { Address, Log, WatchEventReturnType } from "viem";
import { firstPartyStorkAbi, getConfig } from "@oracle-index/shared";
import { getHttpClient, getWsClient } from "./client.js";
import { processLogs } from "./backfill.js";
import { updateCheckpoint, updateChainTip } from "./queries.js";
import { logger } from "./logger.js";

let unwatch: WatchEventReturnType | null = null;

export function startLiveIndexing(fromBlock: bigint): void {
  const config = getConfig();

  logger.info({ fromBlock: fromBlock.toString() }, "Starting live indexing via WebSocket");

  try {
    const wsClient = getWsClient();
    unwatch = wsClient.watchEvent({
      address: config.ORACLE_CONTRACT_ADDRESS as Address,
      events: firstPartyStorkAbi,
      onLogs: async (logs) => {
        try {
          await processLogs(logs as Log[]);
          const maxBlock = logs.reduce(
            (max, l) => (l.blockNumber! > max ? l.blockNumber! : max),
            0n,
          );
          await updateCheckpoint(maxBlock);
          logger.debug(
            { events: logs.length, block: maxBlock.toString() },
            "Live events processed",
          );
        } catch (err) {
          logger.error({ err }, "Error processing live events");
        }
      },
      onError: (err) => {
        logger.error({ err }, "WebSocket event watch error, falling back to polling");
        stopLiveIndexing();
        startPolling(fromBlock);
      },
    });
  } catch (err) {
    logger.warn({ err }, "WebSocket not available, using HTTP polling");
    startPolling(fromBlock);
  }
}

let pollingInterval: ReturnType<typeof setInterval> | null = null;

function startPolling(fromBlock: bigint): void {
  const config = getConfig();
  let lastPolledBlock = fromBlock;

  logger.info("Starting HTTP polling fallback");

  pollingInterval = setInterval(async () => {
    try {
      const client = getHttpClient();
      const latestBlock = await client.getBlockNumber();
      await updateChainTip(latestBlock);

      if (latestBlock <= lastPolledBlock) return;

      const logs = await client.getLogs({
        address: config.ORACLE_CONTRACT_ADDRESS as Address,
        fromBlock: lastPolledBlock + 1n,
        toBlock: latestBlock,
        events: firstPartyStorkAbi,
      });

      if (logs.length > 0) {
        await processLogs(logs as Log[]);
      }

      await updateCheckpoint(latestBlock);
      lastPolledBlock = latestBlock;

      if (logs.length > 0) {
        logger.debug(
          { events: logs.length, block: latestBlock.toString() },
          "Poll: events processed",
        );
      }
    } catch (err) {
      logger.error({ err }, "Polling error");
    }
  }, 5000);
}

export function stopLiveIndexing(): void {
  if (unwatch) {
    unwatch();
    unwatch = null;
  }
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}
