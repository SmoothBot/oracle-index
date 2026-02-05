import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { SeverityBadge } from "../components/SeverityBadge";

const issueTypes = ["", "high_latency", "gap", "price_jump", "stale_price"];
const severities = ["", "warning", "critical"];

export function Issues({ asset }: { asset: string }) {
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [sortField, setSortField] = useState<string>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useQuery({
    queryKey: ["issues-all", asset, typeFilter, severityFilter],
    queryFn: () =>
      api.getIssues({
        type: typeFilter || undefined,
        severity: severityFilter || undefined,
        asset: asset || undefined,
        limit: "200",
      }),
  });

  const issues = data?.issues || [];

  const sorted = [...issues].sort((a, b) => {
    const aVal = (a as unknown as Record<string, unknown>)[sortField];
    const bVal = (b as unknown as Record<string, unknown>)[sortField];
    const cmp = String(aVal).localeCompare(String(bVal));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortIcon = (field: string) =>
    sortField === field ? (sortDir === "asc" ? " ^" : " v") : "";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-sm text-dark-text"
        >
          <option value="">All Types</option>
          {issueTypes.slice(1).map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-sm text-dark-text"
        >
          <option value="">All Severities</option>
          {severities.slice(1).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <a
          href={api.getExportUrl("issues", asset || undefined)}
          className="bg-dark-card border border-dark-border rounded px-3 py-1 text-sm text-dark-text hover:bg-dark-border transition"
          download
        >
          Export CSV
        </a>
      </div>

      {/* Issues table */}
      <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="text-dark-muted p-4">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="text-dark-muted p-8 text-center text-sm">
            No issues found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-muted text-left border-b border-dark-border bg-dark-bg/50">
                  <th
                    className="p-3 cursor-pointer hover:text-dark-text"
                    onClick={() => toggleSort("detected_at")}
                  >
                    Time{sortIcon("detected_at")}
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:text-dark-text"
                    onClick={() => toggleSort("encoded_asset_id")}
                  >
                    Asset{sortIcon("encoded_asset_id")}
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:text-dark-text"
                    onClick={() => toggleSort("issue_type")}
                  >
                    Type{sortIcon("issue_type")}
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:text-dark-text"
                    onClick={() => toggleSort("severity")}
                  >
                    Severity{sortIcon("severity")}
                  </th>
                  <th className="p-3">Block</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((issue) => (
                  <tr
                    key={issue.id}
                    className="border-b border-dark-border/50 hover:bg-dark-bg/30"
                  >
                    <td className="p-3 text-xs">
                      {new Date(issue.detected_at).toLocaleString()}
                    </td>
                    <td className="p-3 font-mono text-xs">{issue.encoded_asset_id.slice(0, 10)}...</td>
                    <td className="p-3 text-xs">{issue.issue_type.replace(/_/g, " ")}</td>
                    <td className="p-3">
                      <SeverityBadge severity={issue.severity} />
                    </td>
                    <td className="p-3 font-mono text-xs text-dark-muted">
                      {issue.block_number}
                    </td>
                    <td className="p-3 text-xs text-dark-muted max-w-xs truncate">
                      {JSON.stringify(issue.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
