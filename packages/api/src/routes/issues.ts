import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function issuesRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      type?: string;
      severity?: string;
      asset?: string;
      cursor?: string;
      limit?: string;
    };
  }>("/api/issues", async (req) => {
    const { type, severity, asset, cursor, limit = "50" } = req.query;
    const pageLimit = Math.min(parseInt(limit) || 50, 200);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (cursor) {
      conditions.push(`id < $${idx++}`);
      params.push(cursor);
    }
    if (type) {
      conditions.push(`issue_type = $${idx++}`);
      params.push(type);
    }
    if (severity) {
      conditions.push(`severity = $${idx++}`);
      params.push(severity);
    }
    if (asset) {
      conditions.push(`encoded_asset_id = $${idx++}`);
      params.push(asset);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(pageLimit + 1);

    const result = await query(
      `SELECT id, encoded_asset_id, issue_type, severity,
              detected_at::text, block_number::text, details
       FROM detected_issues
       ${where}
       ORDER BY id DESC
       LIMIT $${idx}`,
      params,
    );

    const hasMore = result.rows.length > pageLimit;
    const rows = hasMore ? result.rows.slice(0, pageLimit) : result.rows;
    const nextCursor = hasMore ? rows[rows.length - 1].id : null;

    return {
      issues: rows,
      nextCursor,
      hasMore,
    };
  });
}
