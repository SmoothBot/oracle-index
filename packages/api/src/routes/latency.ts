import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function latencyRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: { asset?: string; from?: string; to?: string };
  }>("/api/stats/latency", async (req) => {
    const { asset, from, to } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (asset) {
      conditions.push(`encoded_asset_id = $${idx++}`);
      params.push(asset);
    }
    if (from) {
      conditions.push(`hour >= $${idx++}::timestamptz`);
      params.push(from);
    }
    if (to) {
      conditions.push(`hour <= $${idx++}::timestamptz`);
      params.push(to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [timeSeries, histogram, percentiles] = await Promise.all([
      // Time series from hourly_metrics
      query(
        `SELECT
          hour, encoded_asset_id,
          avg_delay_ms, p50_delay_ms, p95_delay_ms, p99_delay_ms,
          update_count
        FROM hourly_metrics
        ${where}
        ORDER BY hour DESC
        LIMIT 720`,
        params,
      ),
      // Histogram (5 buckets)
      query(
        `SELECT
          CASE
            WHEN avg_delay_ms < 200 THEN '0-200ms'
            WHEN avg_delay_ms < 500 THEN '200-500ms'
            WHEN avg_delay_ms < 1000 THEN '500ms-1s'
            WHEN avg_delay_ms < 5000 THEN '1-5s'
            ELSE '5s+'
          END AS bucket,
          COUNT(*)::int AS count
        FROM hourly_metrics
        ${where}
        GROUP BY bucket
        ORDER BY MIN(avg_delay_ms)`,
        params,
      ),
      // Overall percentiles
      query(
        `SELECT
          ROUND(AVG(avg_delay_ms)::numeric, 1) AS avg,
          ROUND(AVG(p50_delay_ms)::numeric, 1) AS p50,
          ROUND(AVG(p95_delay_ms)::numeric, 1) AS p95,
          ROUND(AVG(p99_delay_ms)::numeric, 1) AS p99,
          ROUND(MIN(min_delay_ms)::numeric, 1) AS min,
          ROUND(MAX(max_delay_ms)::numeric, 1) AS max
        FROM hourly_metrics
        ${where}`,
        params,
      ),
    ]);

    return {
      timeSeries: timeSeries.rows,
      histogram: histogram.rows,
      percentiles: percentiles.rows[0] || null,
    };
  });
}
