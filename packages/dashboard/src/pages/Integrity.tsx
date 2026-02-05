import { useQuery } from "@tanstack/react-query";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api } from "../api";
import { SeverityBadge } from "../components/SeverityBadge";

export function Integrity({ asset }: { asset: string }) {
  const { data: jumpData, isLoading: loadingJumps } = useQuery({
    queryKey: ["issues-jumps", asset],
    queryFn: () =>
      api.getIssues({
        type: "price_jump",
        asset: asset || undefined,
        limit: "200",
      }),
  });

  const { data: staleData, isLoading: loadingStale } = useQuery({
    queryKey: ["issues-stale", asset],
    queryFn: () =>
      api.getIssues({
        type: "stale_price",
        asset: asset || undefined,
        limit: "200",
      }),
  });

  if (loadingJumps || loadingStale) {
    return <div className="text-dark-muted">Loading...</div>;
  }

  const jumps = jumpData?.issues || [];
  const stale = staleData?.issues || [];

  const scatterData = jumps.map((j) => ({
    block: parseInt(j.block_number),
    pctChange: (j.details as { pct_change?: number })?.pct_change || 0,
    asset: j.encoded_asset_id,
    severity: j.severity,
  }));

  return (
    <div className="space-y-6">
      {/* Price jump scatter */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-4">
        <h3 className="text-sm text-dark-muted mb-3">
          Price Jumps ({jumps.length} detected)
        </h3>
        {scatterData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
              <XAxis
                dataKey="block"
                tick={{ fontSize: 10, fill: "#8b8fa3" }}
                name="Block"
              />
              <YAxis
                dataKey="pctChange"
                tick={{ fontSize: 10, fill: "#8b8fa3" }}
                width={50}
                name="% Change"
                unit="%"
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1d2e", border: "1px solid #2a2d3e" }}
                formatter={(value: number) => [`${value}%`, "Change"]}
              />
              <Scatter
                data={scatterData.filter((d) => d.severity === "warning")}
                fill="#f59e0b"
                name="Warning"
              />
              <Scatter
                data={scatterData.filter((d) => d.severity === "critical")}
                fill="#ef4444"
                name="Critical"
              />
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-dark-muted text-sm py-8 text-center">
            No price jumps detected
          </div>
        )}
      </div>

      {/* Price jump table */}
      {jumps.length > 0 && (
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <h3 className="text-sm text-dark-muted mb-3">Price Jump Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-muted text-left border-b border-dark-border">
                  <th className="pb-2 pr-4">Asset</th>
                  <th className="pb-2 pr-4">Severity</th>
                  <th className="pb-2 pr-4">% Change</th>
                  <th className="pb-2 pr-4">Prev Price</th>
                  <th className="pb-2 pr-4">Curr Price</th>
                  <th className="pb-2">Block</th>
                </tr>
              </thead>
              <tbody>
                {jumps.slice(0, 50).map((j) => {
                  const d = j.details as Record<string, unknown>;
                  return (
                    <tr key={j.id} className="border-b border-dark-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">{j.encoded_asset_id.slice(0, 10)}...</td>
                      <td className="py-2 pr-4">
                        <SeverityBadge severity={j.severity} />
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{String(d.pct_change)}%</td>
                      <td className="py-2 pr-4 font-mono text-xs">{String(d.prev_price)}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{String(d.curr_price)}</td>
                      <td className="py-2 font-mono text-xs text-dark-muted">
                        {j.block_number}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stale prices table */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-4">
        <h3 className="text-sm text-dark-muted mb-3">
          Stale Prices ({stale.length} detected)
        </h3>
        {stale.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-muted text-left border-b border-dark-border">
                  <th className="pb-2 pr-4">Asset</th>
                  <th className="pb-2 pr-4">Severity</th>
                  <th className="pb-2 pr-4">Consecutive</th>
                  <th className="pb-2 pr-4">Stale Value</th>
                  <th className="pb-2">Block</th>
                </tr>
              </thead>
              <tbody>
                {stale.map((s) => {
                  const d = s.details as Record<string, unknown>;
                  return (
                    <tr key={s.id} className="border-b border-dark-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">{s.encoded_asset_id.slice(0, 10)}...</td>
                      <td className="py-2 pr-4">
                        <SeverityBadge severity={s.severity} />
                      </td>
                      <td className="py-2 pr-4">{String(d.consecutive_count)}</td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {String(d.stale_value).slice(0, 20)}...
                      </td>
                      <td className="py-2 font-mono text-xs text-dark-muted">
                        {s.block_number}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-dark-muted text-sm py-8 text-center">
            No stale prices detected
          </div>
        )}
      </div>
    </div>
  );
}
