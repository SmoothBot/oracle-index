CREATE TABLE IF NOT EXISTS price_updates (
  id              BIGSERIAL PRIMARY KEY,
  tx_hash         TEXT NOT NULL,
  log_index       INT NOT NULL,
  block_number    BIGINT NOT NULL,
  block_timestamp INT NOT NULL,
  encoded_asset_id TEXT NOT NULL,
  timestamp_ns    NUMERIC(30) NOT NULL,
  quantized_value NUMERIC(60) NOT NULL,
  price           NUMERIC(38, 18) NOT NULL,
  time_delay_ms   INT,
  UNIQUE(tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_price_updates_asset_block
  ON price_updates (encoded_asset_id, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_price_updates_block
  ON price_updates (block_number DESC);
CREATE INDEX IF NOT EXISTS idx_price_updates_timestamp
  ON price_updates (block_timestamp DESC);

CREATE TABLE IF NOT EXISTS indexer_state (
  id                   INT PRIMARY KEY DEFAULT 1,
  last_block           BIGINT NOT NULL DEFAULT 0,
  is_backfill_complete BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chain_tip            BIGINT,
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE indexer_state ADD COLUMN IF NOT EXISTS chain_tip BIGINT;

INSERT INTO indexer_state (id, last_block) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS hourly_metrics (
  id                BIGSERIAL PRIMARY KEY,
  encoded_asset_id  TEXT NOT NULL,
  hour              TIMESTAMPTZ NOT NULL,
  update_count      INT NOT NULL DEFAULT 0,
  avg_delay_ms      DOUBLE PRECISION,
  p50_delay_ms      DOUBLE PRECISION,
  p95_delay_ms      DOUBLE PRECISION,
  p99_delay_ms      DOUBLE PRECISION,
  min_delay_ms      DOUBLE PRECISION,
  max_delay_ms      DOUBLE PRECISION,
  avg_price         NUMERIC(38, 18),
  price_stddev      NUMERIC(38, 18),
  open_price        NUMERIC(38, 18),
  high_price        NUMERIC(38, 18),
  low_price         NUMERIC(38, 18),
  close_price       NUMERIC(38, 18),
  gap_count         INT NOT NULL DEFAULT 0,
  max_gap_seconds   DOUBLE PRECISION,
  UNIQUE(encoded_asset_id, hour)
);

CREATE INDEX IF NOT EXISTS idx_hourly_metrics_asset_hour
  ON hourly_metrics (encoded_asset_id, hour DESC);

CREATE TABLE IF NOT EXISTS detected_issues (
  id                BIGSERIAL PRIMARY KEY,
  encoded_asset_id  TEXT NOT NULL,
  issue_type        TEXT NOT NULL,
  severity          TEXT NOT NULL,
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  block_number      BIGINT NOT NULL,
  details           JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_detected_issues_type
  ON detected_issues (issue_type, severity, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_detected_issues_asset
  ON detected_issues (encoded_asset_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS discovered_assets (
  encoded_asset_id  TEXT PRIMARY KEY,
  first_seen_block  BIGINT NOT NULL,
  last_seen_block   BIGINT NOT NULL,
  update_count      BIGINT NOT NULL DEFAULT 1
);
