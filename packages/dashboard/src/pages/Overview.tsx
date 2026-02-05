import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api } from "../api";
import { StatCard } from "../components/StatCard";

export function Overview({ asset }: { asset: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: api.getOverview,
    refetchInterval: 10_000,
  });

  const { data: latencyData } = useQuery({
    queryKey: ["latency-sparkline", asset],
    queryFn: () => api.getLatency({ asset: asset || undefined }),
  });

  if (isLoading || !data) {
    return <div className="text-dark-muted">Loading...</div>;
  }

  const sparklineData = (latencyData?.timeSeries || [])
    .slice(0, 24)
    .reverse()
    .map((d) => ({
      hour: new Date(d.hour).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      avg: Math.round(d.avg_delay_ms),
      updates: d.update_count,
    }));

  const healthColor =
    data.healthScore >= 80
      ? "text-green-400"
      : data.healthScore >= 50
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Updates" value={data.totalUpdates.toLocaleString()} />
        <StatCard label="Active Assets" value={data.activeAssets} />
        <StatCard
          label="Health Score"
          value={data.healthScore}
          color={healthColor}
        />
        <StatCard
          label="Issues (24h)"
          value={data.issues24h}
          color={data.issues24h > 0 ? "text-yellow-400" : "text-green-400"}
        />
      </div>

      {/* Sync status */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`w-2 h-2 rounded-full ${
              data.syncStatus.isBackfillComplete ? "bg-green-400" : "bg-yellow-400 animate-pulse"
            }`}
          />
          <span className="text-sm text-dark-text">
            {data.syncStatus.isBackfillComplete ? "Synced" : "Backfilling..."}
          </span>
        </div>
        <div className="text-xs text-dark-muted">
          Last block: {data.syncStatus.lastBlock} | Range: {data.earliestBlock} -{" "}
          {data.latestBlock}
          {data.syncStatus.lastUpdated && (
            <> | Updated: {new Date(data.syncStatus.lastUpdated).toLocaleString()}</>
          )}
        </div>
      </div>

      {/* 24h Sparklines */}
      {sparklineData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-dark-card border border-dark-border rounded-lg p-4">
            <h3 className="text-sm text-dark-muted mb-3">Avg Latency (24h)</h3>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={sparklineData}>
                <defs>
                  <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#8b8fa3" }} />
                <YAxis tick={{ fontSize: 10, fill: "#8b8fa3" }} width={40} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1d2e", border: "1px solid #2a2d3e" }}
                />
                <Area
                  type="monotone"
                  dataKey="avg"
                  stroke="#6366f1"
                  fill="url(#latGrad)"
                  name="Avg ms"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-dark-card border border-dark-border rounded-lg p-4">
            <h3 className="text-sm text-dark-muted mb-3">Updates/Hour (24h)</h3>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={sparklineData}>
                <defs>
                  <linearGradient id="updGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#8b8fa3" }} />
                <YAxis tick={{ fontSize: 10, fill: "#8b8fa3" }} width={40} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1d2e", border: "1px solid #2a2d3e" }}
                />
                <Area
                  type="monotone"
                  dataKey="updates"
                  stroke="#10b981"
                  fill="url(#updGrad)"
                  name="Count"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
