import type { PriceUpdate } from "@oracle-index/shared";
import { query, withTransaction } from "./db.js";

export async function insertPriceUpdates(
  updates: PriceUpdate[],
): Promise<void> {
  if (updates.length === 0) return;

  // Batch in groups of 500 to avoid param limit
  for (let start = 0; start < updates.length; start += 500) {
    const batch = updates.slice(start, start + 500);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < batch.length; i++) {
      const u = batch[i];
      const offset = i * 9;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`,
      );
      values.push(
        u.tx_hash,
        u.log_index,
        u.block_number.toString(),
        u.block_timestamp,
        u.encoded_asset_id,
        u.timestamp_ns.toString(),
        u.quantized_value.toString(),
        u.price,
        u.time_delay_ms,
      );
    }

    await query(
      `INSERT INTO price_updates (tx_hash, log_index, block_number, block_timestamp, encoded_asset_id, timestamp_ns, quantized_value, price, time_delay_ms)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (tx_hash, log_index) DO NOTHING`,
      values,
    );
  }
}

export async function upsertDiscoveredAsset(
  encodedAssetId: string,
  blockNumber: bigint,
): Promise<void> {
  await query(
    `INSERT INTO discovered_assets (encoded_asset_id, first_seen_block, last_seen_block, update_count)
     VALUES ($1, $2, $2, 1)
     ON CONFLICT (encoded_asset_id) DO UPDATE SET
       last_seen_block = GREATEST(discovered_assets.last_seen_block, EXCLUDED.last_seen_block),
       update_count = discovered_assets.update_count + 1`,
    [encodedAssetId, blockNumber.toString()],
  );
}

export async function getCheckpoint(): Promise<{
  lastBlock: bigint;
  isBackfillComplete: boolean;
}> {
  const result = await query<{
    last_block: string;
    is_backfill_complete: boolean;
  }>("SELECT last_block, is_backfill_complete FROM indexer_state WHERE id = 1");
  if (result.rows.length === 0) {
    return { lastBlock: 0n, isBackfillComplete: false };
  }
  return {
    lastBlock: BigInt(result.rows[0].last_block),
    isBackfillComplete: result.rows[0].is_backfill_complete,
  };
}

export async function updateChainTip(chainTip: bigint): Promise<void> {
  await query(
    `UPDATE indexer_state SET chain_tip = $1, updated_at = NOW() WHERE id = 1`,
    [chainTip.toString()],
  );
}

export async function updateCheckpoint(
  lastBlock: bigint,
  isBackfillComplete?: boolean,
): Promise<void> {
  if (isBackfillComplete !== undefined) {
    await query(
      `UPDATE indexer_state SET last_block = $1, is_backfill_complete = $2, updated_at = NOW() WHERE id = 1`,
      [lastBlock.toString(), isBackfillComplete],
    );
  } else {
    await query(
      `UPDATE indexer_state SET last_block = $1, updated_at = NOW() WHERE id = 1`,
      [lastBlock.toString()],
    );
  }
}

export { withTransaction };
