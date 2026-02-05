const BASE = import.meta.env.VITE_API_URL || "";

async function fetchJson<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE || window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface OverviewData {
  totalUpdates: number;
  activeAssets: number;
  earliestBlock: string;
  latestBlock: string;
  syncStatus: {
    lastBlock: string;
    isBackfillComplete: boolean;
    lastUpdated: string | null;
  };
  issues24h: number;
  healthScore: number;
}

export interface LatencyData {
  timeSeries: Array<{
    hour: string;
    encoded_asset_id: string;
    avg_delay_ms: number;
    p50_delay_ms: number;
    p95_delay_ms: number;
    p99_delay_ms: number;
    update_count: number;
  }>;
  histogram: Array<{ bucket: string; count: number }>;
  percentiles: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  } | null;
}

export interface GapsData {
  threshold: number;
  gaps: Array<{
    encoded_asset_id: string;
    prev_ts: string | null;
    curr_ts: string | null;
    gap_seconds: number;
    prev_block: string;
    curr_block: string;
  }>;
}

export interface UpdateRecord {
  id: number;
  tx_hash: string;
  log_index: number;
  block_number: string;
  block_timestamp: number;
  encoded_asset_id: string;
  timestamp_ns: string;
  quantized_value: string;
  price: string;
  time_delay_ms: number | null;
}

export interface IssueRecord {
  id: number;
  encoded_asset_id: string;
  issue_type: string;
  severity: string;
  detected_at: string;
  block_number: string;
  details: Record<string, unknown>;
}

export interface AssetRecord {
  encoded_asset_id: string;
  first_seen_block: string;
  last_seen_block: string;
  update_count: string;
  recent_avg_delay_ms: number | null;
  latest_price: string | null;
}

export const api = {
  getOverview: () => fetchJson<OverviewData>("/api/stats/overview"),

  getLatency: (params?: { asset?: string; from?: string; to?: string }) =>
    fetchJson<LatencyData>("/api/stats/latency", params),

  getGaps: (params?: { asset?: string; threshold?: string }) =>
    fetchJson<GapsData>("/api/stats/gaps", params),

  getUpdates: (params?: { asset?: string; cursor?: string; limit?: string }) =>
    fetchJson<{ updates: UpdateRecord[]; nextCursor: number | null; hasMore: boolean }>(
      "/api/updates",
      params,
    ),

  getIssues: (params?: { type?: string; severity?: string; asset?: string; cursor?: string; limit?: string }) =>
    fetchJson<{ issues: IssueRecord[]; nextCursor: number | null; hasMore: boolean }>(
      "/api/issues",
      params,
    ),

  getAssets: () => fetchJson<{ assets: AssetRecord[] }>("/api/assets"),

  getExportUrl: (type: string, asset?: string) => {
    const url = new URL("/api/export/csv", BASE || window.location.origin);
    url.searchParams.set("type", type);
    if (asset) url.searchParams.set("asset", asset);
    return url.toString();
  },
};
