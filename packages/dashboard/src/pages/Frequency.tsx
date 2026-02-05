import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { api } from "../api";
import { StatCard } from "../components/StatCard";

interface Props {
  asset: string;
  from: string;
  to: string;
}

export function Frequency({ asset, from, to }: Props) {
  const { data: latencyData, isLoading } = useQuery({
    queryKey: ["latency-freq", asset, from, to],
    queryFn: () =>
      api.getLatency({
        asset: asset || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const { data: gapsData } = useQuery({
    queryKey: ["gaps", asset],
    queryFn: () => api.getGaps({ asset: asset || undefined }),
  });

  if (isLoading) {
    return <div className="text-dark-muted">Loading...</div>;
  }

  const timeSeries = [...(latencyData?.timeSeries || [])]
    .reverse()
    .map((d) => ({
      hour: new Date(d.hour).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
      }),
      updates: d.update_count,
      asset: d.encoded_asset_id,
    }));

  const totalUpdates = timeSeries.reduce((sum, d) => sum + d.updates, 0);
  const avgPerHour =
    timeSeries.length > 0 ? Math.round(totalUpdates / timeSeries.length) : 0;

  const gaps = gapsData?.gaps || [];

  // Heatmap data: group by day of week and hour
  const heatmapData: Array<{ day: number; hour: number; count: number }> = [];
  const heatmap = new Map<string, number>();
  for (const d of latencyData?.timeSeries || []) {
    const date = new Date(d.hour);
    const key = `${date.getDay()}-${date.getHours()}`;
    heatmap.set(key, (heatmap.get(key) || 0) + d.update_count);
  }
  for (const [key, count] of heatmap) {
    const [day, hour] = key.split("-").map(Number);
    heatmapData.push({ day, hour, count });
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Updates" value={totalUpdates.toLocaleString()} />
        <StatCard label="Avg/Hour" value={avgPerHour} />
        <StatCard label="Gaps (>60s)" value={gaps.length} />
        <StatCard
          label="Max Gap"
          value={
            gaps.length > 0
              ? `${Math.round(gaps[0]?.gap_seconds || 0)}s`
              : "N/A"
          }
        />
      </div>

      {/* Updates per hour */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-4">
        <h3 className="text-sm text-dark-muted mb-3">Updates Per Hour</h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={timeSeries}>
            <defs>
              <linearGradient id="freqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#8b8fa3" }} />
            <YAxis tick={{ fontSize: 10, fill: "#8b8fa3" }} width={50} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1a1d2e", border: "1px solid #2a2d3e" }}
            />
            <Area
              type="monotone"
              dataKey="updates"
              stroke="#10b981"
              fill="url(#freqGrad)"
              name="Updates"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Gap timeline */}
      {gaps.length > 0 && (
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <h3 className="text-sm text-dark-muted mb-3">Gap Timeline</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-muted text-left border-b border-dark-border">
                  <th className="pb-2 pr-4">Asset</th>
                  <th className="pb-2 pr-4">From</th>
                  <th className="pb-2 pr-4">To</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2">Blocks</th>
                </tr>
              </thead>
              <tbody>
                {gaps.slice(0, 50).map((g, i) => (
                  <tr key={i} className="border-b border-dark-border/50">
                    <td className="py-2 pr-4 font-mono text-xs">{g.encoded_asset_id.slice(0, 10)}...</td>
                    <td className="py-2 pr-4 text-xs">{g.prev_ts || "-"}</td>
                    <td className="py-2 pr-4 text-xs">{g.curr_ts || "-"}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`text-xs font-medium ${
                          g.gap_seconds > 300
                            ? "text-red-400"
                            : "text-yellow-400"
                        }`}
                      >
                        {g.gap_seconds}s
                      </span>
                    </td>
                    <td className="py-2 text-xs text-dark-muted">
                      {g.prev_block} - {g.curr_block}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Heatmap (scatter approximation) */}
      {heatmapData.length > 0 && (
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <h3 className="text-sm text-dark-muted mb-3">Activity Heatmap (Day x Hour)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
              <XAxis
                dataKey="hour"
                type="number"
                domain={[0, 23]}
                tick={{ fontSize: 10, fill: "#8b8fa3" }}
                name="Hour"
              />
              <YAxis
                dataKey="day"
                type="number"
                domain={[0, 6]}
                tick={{ fontSize: 10, fill: "#8b8fa3" }}
                name="Day"
                width={30}
              />
              <ZAxis dataKey="count" range={[20, 400]} name="Updates" />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1d2e", border: "1px solid #2a2d3e" }}
              />
              <Scatter data={heatmapData} fill="#6366f1" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
