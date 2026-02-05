import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api } from "../api";
import { StatCard } from "../components/StatCard";

interface Props {
  asset: string;
  from: string;
  to: string;
}

export function Latency({ asset, from, to }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["latency", asset, from, to],
    queryFn: () =>
      api.getLatency({
        asset: asset || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  if (isLoading || !data) {
    return <div className="text-dark-muted">Loading...</div>;
  }

  const timeSeries = [...data.timeSeries]
    .reverse()
    .map((d) => ({
      hour: new Date(d.hour).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
      }),
      avg: Math.round(d.avg_delay_ms),
      p50: Math.round(d.p50_delay_ms),
      p95: Math.round(d.p95_delay_ms),
      p99: Math.round(d.p99_delay_ms),
    }));

  const p = data.percentiles;

  return (
    <div className="space-y-6">
      {/* Percentile summary */}
      {p && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          <StatCard label="Avg" value={`${p.avg}ms`} />
          <StatCard label="P50" value={`${p.p50}ms`} />
          <StatCard label="P95" value={`${p.p95}ms`} />
          <StatCard label="P99" value={`${p.p99}ms`} />
          <StatCard label="Min" value={`${p.min}ms`} />
          <StatCard label="Max" value={`${p.max}ms`} />
        </div>
      )}

      {/* Time series */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-4">
        <h3 className="text-sm text-dark-muted mb-3">
          Latency Over Time (avg / p50 / p95 / p99)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={timeSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#8b8fa3" }} />
            <YAxis tick={{ fontSize: 10, fill: "#8b8fa3" }} width={50} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1a1d2e", border: "1px solid #2a2d3e" }}
            />
            <Legend />
            <Line type="monotone" dataKey="avg" stroke="#6366f1" dot={false} name="Avg" />
            <Line type="monotone" dataKey="p50" stroke="#10b981" dot={false} name="P50" />
            <Line type="monotone" dataKey="p95" stroke="#f59e0b" dot={false} name="P95" />
            <Line type="monotone" dataKey="p99" stroke="#ef4444" dot={false} name="P99" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Histogram */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-4">
        <h3 className="text-sm text-dark-muted mb-3">Latency Distribution</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.histogram}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#8b8fa3" }} />
            <YAxis tick={{ fontSize: 10, fill: "#8b8fa3" }} width={40} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1a1d2e", border: "1px solid #2a2d3e" }}
            />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Hours" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-asset comparison */}
      {!asset && (
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <h3 className="text-sm text-dark-muted mb-3">Per-Asset Average Latency</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={(() => {
                const byAsset = new Map<string, number[]>();
                for (const row of data.timeSeries) {
                  if (!byAsset.has(row.encoded_asset_id)) byAsset.set(row.encoded_asset_id, []);
                  byAsset.get(row.encoded_asset_id)!.push(row.avg_delay_ms);
                }
                return [...byAsset.entries()].map(([id, vals]) => ({
                  asset: id,
                  avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
                }));
              })()}
              layout="vertical"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#8b8fa3" }} />
              <YAxis
                dataKey="asset"
                type="category"
                tick={{ fontSize: 10, fill: "#8b8fa3" }}
                width={80}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1d2e", border: "1px solid #2a2d3e" }}
              />
              <Bar dataKey="avg" fill="#10b981" radius={[0, 4, 4, 0]} name="Avg ms" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
