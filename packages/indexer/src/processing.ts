import { query } from "./db.js";
import { logger } from "./logger.js";

const PROCESSING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let processingTimer: ReturnType<typeof setInterval> | null = null;

export function startProcessingLoop(): void {
  logger.info("Starting data processing loop (5 min interval)");
  runProcessing().catch((err) =>
    logger.error({ err }, "Initial processing run failed"),
  );
  processingTimer = setInterval(() => {
    runProcessing().catch((err) =>
      logger.error({ err }, "Processing loop error"),
    );
  }, PROCESSING_INTERVAL_MS);
}

export function stopProcessingLoop(): void {
  if (processingTimer) {
    clearInterval(processingTimer);
    processingTimer = null;
  }
}

async function runProcessing(): Promise<void> {
  logger.info("Running data processing");
  await computeHourlyMetrics();
  await detectIssues();
  logger.info("Data processing complete");
}

async function computeHourlyMetrics(): Promise<void> {
  await query(`
    INSERT INTO hourly_metrics (
      encoded_asset_id, hour,
      update_count, avg_delay_ms, p50_delay_ms, p95_delay_ms, p99_delay_ms,
      min_delay_ms, max_delay_ms, avg_price, price_stddev,
      gap_count, max_gap_seconds
    )
    SELECT
      encoded_asset_id,
      date_trunc('hour', to_timestamp(block_timestamp)) AS hour,
      COUNT(*)::int AS update_count,
      AVG(time_delay_ms) AS avg_delay_ms,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY time_delay_ms) AS p50_delay_ms,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY time_delay_ms) AS p95_delay_ms,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY time_delay_ms) AS p99_delay_ms,
      MIN(time_delay_ms) AS min_delay_ms,
      MAX(time_delay_ms) AS max_delay_ms,
      AVG(price::numeric) AS avg_price,
      STDDEV(price::numeric) AS price_stddev,
      0 AS gap_count,
      NULL AS max_gap_seconds
    FROM price_updates
    WHERE block_timestamp >= EXTRACT(EPOCH FROM NOW() - INTERVAL '2 hours')::int
      AND time_delay_ms IS NOT NULL
    GROUP BY encoded_asset_id, date_trunc('hour', to_timestamp(block_timestamp))
    ON CONFLICT (encoded_asset_id, hour) DO UPDATE SET
      update_count = EXCLUDED.update_count,
      avg_delay_ms = EXCLUDED.avg_delay_ms,
      p50_delay_ms = EXCLUDED.p50_delay_ms,
      p95_delay_ms = EXCLUDED.p95_delay_ms,
      p99_delay_ms = EXCLUDED.p99_delay_ms,
      min_delay_ms = EXCLUDED.min_delay_ms,
      max_delay_ms = EXCLUDED.max_delay_ms,
      avg_price = EXCLUDED.avg_price,
      price_stddev = EXCLUDED.price_stddev
  `);
  logger.debug("Hourly metrics computed");
}

async function detectIssues(): Promise<void> {
  await detectHighLatency();
  await detectPriceJumps();
  await detectStalePrices();
  await detectGaps();
}

async function detectHighLatency(): Promise<void> {
  const result = await query(`
    INSERT INTO detected_issues (encoded_asset_id, issue_type, severity, block_number, details)
    SELECT
      encoded_asset_id,
      'high_latency',
      CASE WHEN time_delay_ms > 5000 THEN 'critical' ELSE 'warning' END,
      block_number,
      jsonb_build_object(
        'time_delay_ms', time_delay_ms,
        'tx_hash', tx_hash,
        'price', price
      )
    FROM price_updates
    WHERE time_delay_ms > 1000
      AND block_timestamp >= EXTRACT(EPOCH FROM NOW() - INTERVAL '10 minutes')::int
      AND NOT EXISTS (
        SELECT 1 FROM detected_issues di
        WHERE di.encoded_asset_id = price_updates.encoded_asset_id
          AND di.issue_type = 'high_latency'
          AND di.block_number = price_updates.block_number
      )
  `);
  if (result.rowCount && result.rowCount > 0) {
    logger.info({ count: result.rowCount }, "High latency issues detected");
  }
}

async function detectPriceJumps(): Promise<void> {
  const result = await query(`
    INSERT INTO detected_issues (encoded_asset_id, issue_type, severity, block_number, details)
    SELECT
      encoded_asset_id,
      'price_jump',
      CASE WHEN pct_change > 10 THEN 'critical' ELSE 'warning' END,
      block_number,
      jsonb_build_object(
        'pct_change', ROUND(pct_change::numeric, 2),
        'prev_price', prev_price,
        'curr_price', price,
        'tx_hash', tx_hash
      )
    FROM (
      SELECT
        encoded_asset_id, block_number, tx_hash, price,
        LAG(price) OVER (PARTITION BY encoded_asset_id ORDER BY block_number, log_index) AS prev_price,
        CASE
          WHEN LAG(price::numeric) OVER (PARTITION BY encoded_asset_id ORDER BY block_number, log_index) = 0
            THEN 0
          ELSE ABS(
            (price::numeric - LAG(price::numeric) OVER (PARTITION BY encoded_asset_id ORDER BY block_number, log_index))
            / LAG(price::numeric) OVER (PARTITION BY encoded_asset_id ORDER BY block_number, log_index)
            * 100
          )
        END AS pct_change
      FROM price_updates
      WHERE block_timestamp >= EXTRACT(EPOCH FROM NOW() - INTERVAL '10 minutes')::int
    ) sub
    WHERE pct_change > 5
      AND prev_price IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM detected_issues di
        WHERE di.encoded_asset_id = sub.encoded_asset_id
          AND di.issue_type = 'price_jump'
          AND di.block_number = sub.block_number
      )
  `);
  if (result.rowCount && result.rowCount > 0) {
    logger.info({ count: result.rowCount }, "Price jump issues detected");
  }
}

async function detectStalePrices(): Promise<void> {
  const result = await query(`
    INSERT INTO detected_issues (encoded_asset_id, issue_type, severity, block_number, details)
    SELECT
      encoded_asset_id,
      'stale_price',
      CASE WHEN consecutive_count >= 10 THEN 'critical' ELSE 'warning' END,
      max_block,
      jsonb_build_object(
        'consecutive_count', consecutive_count,
        'stale_value', stale_value
      )
    FROM (
      SELECT
        encoded_asset_id,
        quantized_value::text AS stale_value,
        COUNT(*) AS consecutive_count,
        MAX(block_number) AS max_block
      FROM (
        SELECT
          encoded_asset_id, quantized_value, block_number,
          block_number - ROW_NUMBER() OVER (
            PARTITION BY encoded_asset_id, quantized_value
            ORDER BY block_number
          ) AS grp
        FROM price_updates
        WHERE block_timestamp >= EXTRACT(EPOCH FROM NOW() - INTERVAL '10 minutes')::int
      ) grouped
      GROUP BY encoded_asset_id, quantized_value, grp
      HAVING COUNT(*) >= 3
    ) stale
    WHERE NOT EXISTS (
      SELECT 1 FROM detected_issues di
      WHERE di.encoded_asset_id = stale.encoded_asset_id
        AND di.issue_type = 'stale_price'
        AND di.block_number = stale.max_block
    )
  `);
  if (result.rowCount && result.rowCount > 0) {
    logger.info({ count: result.rowCount }, "Stale price issues detected");
  }
}

async function detectGaps(): Promise<void> {
  const result = await query(`
    INSERT INTO detected_issues (encoded_asset_id, issue_type, severity, block_number, details)
    SELECT
      encoded_asset_id,
      'gap',
      CASE WHEN gap_seconds > 300 THEN 'critical' ELSE 'warning' END,
      block_number,
      jsonb_build_object(
        'gap_seconds', gap_seconds,
        'prev_block', prev_block,
        'curr_block', block_number
      )
    FROM (
      SELECT
        encoded_asset_id, block_number,
        LAG(block_number) OVER w AS prev_block,
        block_timestamp - LAG(block_timestamp) OVER w AS gap_seconds
      FROM price_updates
      WHERE block_timestamp >= EXTRACT(EPOCH FROM NOW() - INTERVAL '10 minutes')::int
      WINDOW w AS (PARTITION BY encoded_asset_id ORDER BY block_number, log_index)
    ) sub
    WHERE gap_seconds > 60
      AND NOT EXISTS (
        SELECT 1 FROM detected_issues di
        WHERE di.encoded_asset_id = sub.encoded_asset_id
          AND di.issue_type = 'gap'
          AND di.block_number = sub.block_number
      )
  `);
  if (result.rowCount && result.rowCount > 0) {
    logger.info({ count: result.rowCount }, "Gap issues detected");
  }
}
