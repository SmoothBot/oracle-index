export interface PriceUpdate {
  id?: number;
  tx_hash: string;
  log_index: number;
  block_number: bigint;
  block_timestamp: number;
  encoded_asset_id: string;
  timestamp_ns: bigint;
  quantized_value: bigint;
  price: string;
  time_delay_ms: number | null;
}

export interface IndexerState {
  id: number;
  last_block: bigint;
  is_backfill_complete: boolean;
  updated_at: Date;
}

export interface HourlyMetric {
  id?: number;
  encoded_asset_id: string;
  hour: Date;
  update_count: number;
  avg_delay_ms: number;
  p50_delay_ms: number;
  p95_delay_ms: number;
  p99_delay_ms: number;
  min_delay_ms: number;
  max_delay_ms: number;
  avg_price: string;
  price_stddev: string;
  gap_count: number;
  max_gap_seconds: number;
}

export interface DetectedIssue {
  id?: number;
  encoded_asset_id: string;
  issue_type: "high_latency" | "gap" | "price_jump" | "stale_price";
  severity: "warning" | "critical";
  detected_at: Date;
  block_number: bigint;
  details: Record<string, unknown>;
}

export interface DiscoveredAsset {
  encoded_asset_id: string;
  first_seen_block: bigint;
  last_seen_block: bigint;
  update_count: number;
}
