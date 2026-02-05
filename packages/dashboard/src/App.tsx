import { Routes, Route, NavLink } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { Overview } from "./pages/Overview";
import { Latency } from "./pages/Latency";
import { Frequency } from "./pages/Frequency";
import { Integrity } from "./pages/Integrity";
import { Issues } from "./pages/Issues";

const navItems = [
  { to: "/", label: "Overview" },
  { to: "/latency", label: "Latency" },
  { to: "/frequency", label: "Frequency" },
  { to: "/integrity", label: "Integrity" },
  { to: "/issues", label: "Issues" },
];

export function App() {
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: assetsData } = useQuery({
    queryKey: ["assets"],
    queryFn: api.getAssets,
  });

  const assets = assetsData?.assets || [];

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="border-b border-dark-border bg-dark-card">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-dark-text">
            Stork Oracle Audit
          </h1>
          <div className="flex items-center gap-3">
            <select
              value={selectedAsset}
              onChange={(e) => setSelectedAsset(e.target.value)}
              className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-sm text-dark-text"
            >
              <option value="">All Assets</option>
              {assets.map((a) => (
                <option key={a.encoded_asset_id} value={a.encoded_asset_id}>
                  {a.encoded_asset_id.slice(0, 10)}... {a.latest_price ? `($${parseFloat(a.latest_price).toFixed(2)})` : ""}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="From"
              className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-sm text-dark-text"
            />
            <input
              type="datetime-local"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="To"
              className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-sm text-dark-text"
            />
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-4 flex gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `px-3 py-2 text-sm rounded-t ${
                  isActive
                    ? "bg-dark-bg text-dark-text border-t border-x border-dark-border"
                    : "text-dark-muted hover:text-dark-text"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route
            path="/"
            element={<Overview asset={selectedAsset} />}
          />
          <Route
            path="/latency"
            element={
              <Latency asset={selectedAsset} from={dateFrom} to={dateTo} />
            }
          />
          <Route
            path="/frequency"
            element={
              <Frequency asset={selectedAsset} from={dateFrom} to={dateTo} />
            }
          />
          <Route
            path="/integrity"
            element={<Integrity asset={selectedAsset} />}
          />
          <Route
            path="/issues"
            element={<Issues asset={selectedAsset} />}
          />
        </Routes>
      </main>
    </div>
  );
}
