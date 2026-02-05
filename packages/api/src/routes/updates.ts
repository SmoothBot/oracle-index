import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function updatesRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      asset?: string;
      cursor?: string;
      limit?: string;
    };
  }>("/api/updates", async (req) => {
    const { asset, cursor, limit = "50" } = req.query;
    const pageLimit = Math.min(parseInt(limit) || 50, 200);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (cursor) {
      conditions.push(`id < $${idx++}`);
      params.push(cursor);
    }
    if (asset) {
      conditions.push(`encoded_asset_id = $${idx++}`);
      params.push(asset);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(pageLimit + 1); // fetch one extra to check for next page

    const result = await query(
      `SELECT id, tx_hash, log_index, block_number::text, block_timestamp,
              encoded_asset_id, timestamp_ns::text,
              quantized_value::text, price, time_delay_ms
       FROM price_updates
       ${where}
       ORDER BY id DESC
       LIMIT $${idx}`,
      params,
    );

    const hasMore = result.rows.length > pageLimit;
    const rows = hasMore ? result.rows.slice(0, pageLimit) : result.rows;
    const nextCursor = hasMore ? rows[rows.length - 1].id : null;

    return {
      updates: rows,
      nextCursor,
      hasMore,
    };
  });
}
