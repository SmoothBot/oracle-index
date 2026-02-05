import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function overviewRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/stats/overview", async () => {
    const [totals, assets, indexerState, recentIssues] = await Promise.all([
      query<{ total_updates: string; earliest_block: string; latest_block: string }>(
        `SELECT
          COUNT(*)::text AS total_updates,
          COALESCE(MIN(block_number), 0)::text AS earliest_block,
          COALESCE(MAX(block_number), 0)::text AS latest_block
        FROM price_updates`,
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM discovered_assets`,
      ),
      query<{
        last_block: string;
        is_backfill_complete: boolean;
        updated_at: string;
      }>(`SELECT last_block::text, is_backfill_complete, updated_at::text FROM indexer_state WHERE id = 1`),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM detected_issues
         WHERE detected_at > NOW() - INTERVAL '24 hours'`,
      ),
    ]);

    const state = indexerState.rows[0];
    const total = totals.rows[0];
    const issueCount = parseInt(recentIssues.rows[0]?.count || "0");

    // Simple health score: 100 - issues_24h (min 0)
    const healthScore = Math.max(0, 100 - issueCount);

    return {
      totalUpdates: parseInt(total.total_updates),
      activeAssets: parseInt(assets.rows[0].count),
      earliestBlock: total.earliest_block,
      latestBlock: total.latest_block,
      syncStatus: {
        lastBlock: state?.last_block || "0",
        isBackfillComplete: state?.is_backfill_complete || false,
        lastUpdated: state?.updated_at || null,
      },
      issues24h: issueCount,
      healthScore,
    };
  });
}
