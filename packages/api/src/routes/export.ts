import type { FastifyInstance, FastifyReply } from "fastify";
import { getPool } from "../db.js";

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: { type?: string; asset?: string };
  }>("/api/export/csv", async (req, reply) => {
    const { type = "updates", asset } = req.query;

    reply.header("Content-Type", "text/csv");
    reply.header(
      "Content-Disposition",
      `attachment; filename="${type}_${Date.now()}.csv"`,
    );

    const pool = getPool();
    const client = await pool.connect();

    try {
      let sql: string;
      if (type === "issues") {
        const assetFilter = asset ? `WHERE encoded_asset_id = '${asset.replace(/'/g, "''")}'` : "";
        sql = `COPY (
          SELECT id, encoded_asset_id, issue_type, severity,
                 detected_at, block_number, details::text
          FROM detected_issues ${assetFilter}
          ORDER BY id DESC
        ) TO STDOUT WITH CSV HEADER`;
      } else {
        const assetFilter = asset ? `WHERE encoded_asset_id = '${asset.replace(/'/g, "''")}'` : "";
        sql = `COPY (
          SELECT id, tx_hash, log_index, block_number, block_timestamp,
                 encoded_asset_id, timestamp_ns, quantized_value,
                 price, time_delay_ms
          FROM price_updates ${assetFilter}
          ORDER BY id DESC
          LIMIT 100000
        ) TO STDOUT WITH CSV HEADER`;
      }

      const stream = client.query(
        // Use pg-copy-streams compatible approach
        sql,
      );

      // For simplicity, we use COPY TO STDOUT and stream it
      // But node-pg doesn't directly support COPY TO STDOUT in query()
      // So we'll do a regular query and manually format CSV

      const regularSql = type === "issues"
        ? `SELECT id, encoded_asset_id, issue_type, severity,
                  detected_at::text, block_number::text, details::text
           FROM detected_issues ${asset ? `WHERE encoded_asset_id = $1` : ""}
           ORDER BY id DESC LIMIT 100000`
        : `SELECT id, tx_hash, log_index, block_number::text, block_timestamp,
                  encoded_asset_id, timestamp_ns::text, quantized_value::text,
                  price, time_delay_ms
           FROM price_updates ${asset ? `WHERE encoded_asset_id = $1` : ""}
           ORDER BY id DESC LIMIT 100000`;

      const params = asset ? [asset] : [];
      const result = await client.query(regularSql, params);

      if (result.rows.length === 0) {
        return reply.send("No data\n");
      }

      const headers = Object.keys(result.rows[0]);
      let csv = headers.join(",") + "\n";
      for (const row of result.rows) {
        csv +=
          headers
            .map((h) => {
              const val = row[h];
              if (val === null || val === undefined) return "";
              const str = String(val);
              return str.includes(",") || str.includes('"')
                ? `"${str.replace(/"/g, '""')}"`
                : str;
            })
            .join(",") + "\n";
      }

      return reply.send(csv);
    } finally {
      client.release();
    }
  });
}
