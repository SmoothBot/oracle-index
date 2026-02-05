-- ============================================================
-- Incremental rollup: only processes hours >= watermark
-- On each run: delete + reinsert affected hour buckets,
-- then advance the watermark to the max hour of actual data.
-- The current (incomplete) hour is always re-rolled next run.
-- ============================================================

-- Schema (idempotent)
CREATE TABLE IF NOT EXISTS rollup_state (
  id         INT PRIMARY KEY DEFAULT 1,
  watermark  TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rollup_single_row CHECK (id = 1)
);
INSERT INTO rollup_state (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS rollup_hourly_totals (
  hour           TIMESTAMPTZ PRIMARY KEY,
  event_count    INT NOT NULL DEFAULT 0,
  distinct_blocks INT NOT NULL DEFAULT 0,
  distinct_feeds  INT NOT NULL DEFAULT 0,
  max_block      BIGINT
);
-- Add column if upgrading from old schema
ALTER TABLE rollup_hourly_totals ADD COLUMN IF NOT EXISTS max_block BIGINT;

CREATE TABLE IF NOT EXISTS rollup_price_changes (
  id                BIGSERIAL PRIMARY KEY,
  encoded_asset_id  TEXT NOT NULL,
  block_number      BIGINT NOT NULL,
  block_timestamp   INT NOT NULL,
  prev_price        NUMERIC(38, 18) NOT NULL,
  new_price         NUMERIC(38, 18) NOT NULL,
  change_pct        NUMERIC(10, 4) NOT NULL,
  UNIQUE(encoded_asset_id, block_number)
);
CREATE INDEX IF NOT EXISTS idx_price_changes_ts
  ON rollup_price_changes (block_timestamp DESC);

CREATE TABLE IF NOT EXISTS rollup_block_gaps (
  block_number    BIGINT PRIMARY KEY,
  block_timestamp INT NOT NULL,
  prev_block      BIGINT NOT NULL,
  gap_size        INT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_block_gaps_ts
  ON rollup_block_gaps (block_timestamp DESC);

CREATE TABLE IF NOT EXISTS rollup_minute_prices (
  encoded_asset_id TEXT NOT NULL,
  minute           TIMESTAMPTZ NOT NULL,
  close_price      NUMERIC(38, 18) NOT NULL,
  update_count     INT NOT NULL DEFAULT 0,
  PRIMARY KEY (encoded_asset_id, minute)
);
CREATE INDEX IF NOT EXISTS idx_minute_prices_minute
  ON rollup_minute_prices (minute DESC);

-- Add OHLC columns to hourly_metrics if they don't exist
ALTER TABLE hourly_metrics ADD COLUMN IF NOT EXISTS open_price NUMERIC(38, 18);
ALTER TABLE hourly_metrics ADD COLUMN IF NOT EXISTS high_price NUMERIC(38, 18);
ALTER TABLE hourly_metrics ADD COLUMN IF NOT EXISTS low_price NUMERIC(38, 18);
ALTER TABLE hourly_metrics ADD COLUMN IF NOT EXISTS close_price NUMERIC(38, 18);

-- Run the incremental rollup
DO $$
DECLARE
  v_watermark    TIMESTAMPTZ;
  v_current_hour TIMESTAMPTZ := date_trunc('hour', NOW());
  v_min_ts       BIGINT;
  v_count        INT;
BEGIN
  SELECT watermark INTO v_watermark FROM rollup_state WHERE id = 1;
  v_min_ts := EXTRACT(EPOCH FROM v_watermark)::bigint;

  -- Check for new data
  SELECT COUNT(*) INTO v_count
  FROM price_updates WHERE block_timestamp >= v_min_ts LIMIT 1;
  IF v_count = 0 THEN
    RAISE NOTICE 'rollup: no new data';
    RETURN;
  END IF;

  RAISE NOTICE 'rollup: processing from %', v_watermark;

  -- --------------------------------------------------------
  -- 1. Per-feed hourly metrics with OHLC
  -- --------------------------------------------------------
  DELETE FROM hourly_metrics WHERE hour >= v_watermark;

  INSERT INTO hourly_metrics (
    encoded_asset_id, hour, update_count,
    avg_delay_ms, p50_delay_ms, p95_delay_ms, p99_delay_ms,
    min_delay_ms, max_delay_ms,
    avg_price, price_stddev,
    open_price, high_price, low_price, close_price,
    gap_count, max_gap_seconds
  )
  SELECT
    encoded_asset_id,
    date_trunc('hour', to_timestamp(block_timestamp)) AS hour,
    COUNT(*)::int,
    AVG(time_delay_ms)::double precision,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY time_delay_ms)::double precision,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY time_delay_ms)::double precision,
    percentile_cont(0.99) WITHIN GROUP (ORDER BY time_delay_ms)::double precision,
    MIN(time_delay_ms)::double precision,
    MAX(time_delay_ms)::double precision,
    AVG(price),
    STDDEV(price),
    (ARRAY_AGG(price ORDER BY block_timestamp ASC))[1],   -- open
    MAX(price),                                             -- high
    MIN(price),                                             -- low
    (ARRAY_AGG(price ORDER BY block_timestamp DESC))[1],   -- close
    0,    -- gap_count (not computed here)
    NULL  -- max_gap_seconds
  FROM price_updates
  WHERE block_timestamp >= v_min_ts
  GROUP BY encoded_asset_id, date_trunc('hour', to_timestamp(block_timestamp));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'rollup: upserted % hourly_metrics rows', v_count;

  -- --------------------------------------------------------
  -- 2. Per-feed minute prices (close + count only)
  -- --------------------------------------------------------
  DELETE FROM rollup_minute_prices
  WHERE minute >= v_watermark;

  INSERT INTO rollup_minute_prices (encoded_asset_id, minute, close_price, update_count)
  SELECT
    encoded_asset_id,
    date_trunc('minute', to_timestamp(block_timestamp)) AS minute,
    (ARRAY_AGG(price ORDER BY block_timestamp DESC))[1],  -- close
    COUNT(*)::int
  FROM price_updates
  WHERE block_timestamp >= v_min_ts
  GROUP BY encoded_asset_id, date_trunc('minute', to_timestamp(block_timestamp));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'rollup: upserted % minute_prices rows', v_count;

  -- --------------------------------------------------------
  -- 3. System-wide hourly totals with max_block
  -- --------------------------------------------------------
  DELETE FROM rollup_hourly_totals WHERE hour >= v_watermark;

  INSERT INTO rollup_hourly_totals (hour, event_count, distinct_blocks, distinct_feeds, max_block)
  SELECT
    date_trunc('hour', to_timestamp(block_timestamp)) AS hour,
    COUNT(*)::int,
    COUNT(DISTINCT block_number)::int,
    COUNT(DISTINCT encoded_asset_id)::int,
    MAX(block_number)
  FROM price_updates
  WHERE block_timestamp >= v_min_ts
  GROUP BY date_trunc('hour', to_timestamp(block_timestamp));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'rollup: upserted % hourly_totals rows', v_count;

  -- --------------------------------------------------------
  -- 4. Large price changes (> 1%) — append only
  --    Look back 1 hour for LAG() context across the boundary
  -- --------------------------------------------------------
  INSERT INTO rollup_price_changes (
    encoded_asset_id, block_number, block_timestamp,
    prev_price, new_price, change_pct
  )
  WITH consecutive AS (
    SELECT
      encoded_asset_id,
      block_number,
      block_timestamp,
      price,
      LAG(price) OVER (
        PARTITION BY encoded_asset_id ORDER BY block_number
      ) AS prev_price
    FROM price_updates
    WHERE block_timestamp >= v_min_ts - 3600
  )
  SELECT
    encoded_asset_id,
    block_number,
    block_timestamp,
    prev_price,
    price,
    ROUND(((price - prev_price) / prev_price * 100)::numeric, 4)
  FROM consecutive
  WHERE prev_price > 0
    AND ABS((price - prev_price) / prev_price) > 0.01
    AND block_timestamp >= v_min_ts
  ON CONFLICT (encoded_asset_id, block_number) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'rollup: inserted % price_change rows', v_count;

  -- --------------------------------------------------------
  -- 5. Block gaps — delete + reinsert with verification
  --    Find gaps in block_number sequence > 1
  --    Look back 1 hour for LAG() context across the boundary
  --    Verify each gap against full dataset to avoid false
  --    positives from concurrent backfill batches
  -- --------------------------------------------------------
  DELETE FROM rollup_block_gaps WHERE block_timestamp >= v_min_ts;

  INSERT INTO rollup_block_gaps (block_number, block_timestamp, prev_block, gap_size)
  WITH blocks AS (
    SELECT DISTINCT block_number, MIN(block_timestamp) AS ts
    FROM price_updates
    WHERE block_timestamp >= v_min_ts - 3600
    GROUP BY block_number
  ),
  ordered AS (
    SELECT
      block_number, ts,
      LAG(block_number) OVER (ORDER BY block_number) AS prev_block
    FROM blocks
  ),
  potential AS (
    SELECT block_number, ts, prev_block, (block_number - prev_block)::int AS gap
    FROM ordered
    WHERE prev_block IS NOT NULL
      AND block_number - prev_block > 1
      AND ts >= v_min_ts
  )
  SELECT p.block_number, p.ts, p.prev_block, p.gap
  FROM potential p
  WHERE (
    SELECT COUNT(DISTINCT pu.block_number)
    FROM price_updates pu
    WHERE pu.block_number > p.prev_block AND pu.block_number < p.block_number
  ) < p.gap - 1
  ON CONFLICT (block_number) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'rollup: inserted % block_gap rows', v_count;

  -- --------------------------------------------------------
  -- 6. Advance watermark to the max hour of actual data
  -- --------------------------------------------------------
  UPDATE rollup_state
  SET watermark = COALESCE(
    (SELECT date_trunc('hour', to_timestamp(MAX(block_timestamp)))
     FROM price_updates),
    v_watermark
  ),
  updated_at = NOW()
  WHERE id = 1;

  SELECT watermark INTO v_watermark FROM rollup_state WHERE id = 1;
  RAISE NOTICE 'rollup: done — watermark advanced to %', v_watermark;
END $$;
