import { decodeEventLog, type Log, formatUnits } from "viem";
import { firstPartyStorkAbi } from "@oracle-index/shared";
import type { PriceUpdate } from "@oracle-index/shared";
import { logger } from "./logger.js";

const DECIMALS = 18;

interface DecodedEvents {
  priceUpdates: PriceUpdate[];
  assetIds: Set<string>;
}

export function decodeLogs(
  logs: Log[],
  blockTimestamps: Map<bigint, number>,
): DecodedEvents {
  const priceUpdates: PriceUpdate[] = [];
  const assetIds = new Set<string>();

  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: firstPartyStorkAbi,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName !== "ValueUpdate") continue;

      const blockNumber = log.blockNumber!;
      const blockTs = blockTimestamps.get(blockNumber) ?? 0;

      const { id, timestampNs, quantizedValue } = decoded.args as {
        id: `0x${string}`;
        timestampNs: bigint;
        quantizedValue: bigint;
      };

      const absValue = quantizedValue < 0n ? -quantizedValue : quantizedValue;
      const price = formatUnits(absValue, DECIMALS);
      const priceStr = quantizedValue < 0n ? `-${price}` : price;

      // time_delay_ms: block_timestamp (seconds) - timestampNs / 1e9 -> ms
      let timeDelayMs: number | null = null;
      if (blockTs > 0) {
        const publisherTimeSec = Number(timestampNs) / 1e9;
        timeDelayMs = Math.round((blockTs - publisherTimeSec) * 1000);
      }

      priceUpdates.push({
        tx_hash: log.transactionHash!,
        log_index: log.logIndex!,
        block_number: blockNumber,
        block_timestamp: blockTs,
        encoded_asset_id: id,
        timestamp_ns: timestampNs,
        quantized_value: quantizedValue,
        price: priceStr,
        time_delay_ms: timeDelayMs,
      });

      assetIds.add(id);
    } catch (err) {
      logger.warn(
        { err, txHash: log.transactionHash, logIndex: log.logIndex },
        "Failed to decode log",
      );
    }
  }

  return { priceUpdates, assetIds };
}
