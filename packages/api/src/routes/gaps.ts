import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function gapsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: { asset?: string; threshold?: string };
  }>("/api/stats/gaps", async (req) => {
    const { asset, threshold = "60" } = req.query;
    const thresholdSec = parseInt(threshold) || 60;

    const conditions: string[] = [];
    const params: unknown[] = [thresholdSec];
    let idx = 2;

    if (asset) {
      conditions.push(`encoded_asset_id = $${idx++}`);
      params.push(asset);
    }

    const assetFilter = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT encoded_asset_id, prev_ts, curr_ts, gap_seconds, prev_block, curr_block
       FROM (
         SELECT
           encoded_asset_id,
           LAG(block_timestamp) OVER w AS prev_ts,
           block_timestamp AS curr_ts,
           block_timestamp - LAG(block_timestamp) OVER w AS gap_seconds,
           LAG(block_number) OVER w AS prev_block,
           block_number AS curr_block
         FROM price_updates
         WHERE 1=1 ${assetFilter}
         WINDOW w AS (PARTITION BY encoded_asset_id ORDER BY block_number, log_index)
       ) sub
       WHERE gap_seconds > $1
       ORDER BY gap_seconds DESC
       LIMIT 500`,
      params,
    );

    return {
      threshold: thresholdSec,
      gaps: result.rows.map((r: Record<string, unknown>) => ({
        ...r,
        prev_ts: r.prev_ts ? new Date((r.prev_ts as number) * 1000).toISOString() : null,
        curr_ts: r.curr_ts ? new Date((r.curr_ts as number) * 1000).toISOString() : null,
      })),
    };
  });
}
