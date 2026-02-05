import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function assetsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/assets", async () => {
    const result = await query(
      `SELECT
        da.encoded_asset_id,
        da.first_seen_block::text,
        da.last_seen_block::text,
        da.update_count::text,
        (
          SELECT ROUND(AVG(time_delay_ms)::numeric, 1)
          FROM (
            SELECT time_delay_ms FROM price_updates pu
            WHERE pu.encoded_asset_id = da.encoded_asset_id AND time_delay_ms IS NOT NULL
            ORDER BY id DESC LIMIT 100
          ) recent
        ) AS recent_avg_delay_ms,
        (
          SELECT price FROM price_updates pu
          WHERE pu.encoded_asset_id = da.encoded_asset_id
          ORDER BY id DESC LIMIT 1
        ) AS latest_price
      FROM discovered_assets da
      ORDER BY da.update_count DESC`,
    );

    return { assets: result.rows };
  });
}
