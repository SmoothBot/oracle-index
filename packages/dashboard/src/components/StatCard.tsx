interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export function StatCard({ label, value, sub, color = "text-dark-text" }: StatCardProps) {
  return (
    <div className="bg-dark-card border border-dark-border rounded-lg p-4">
      <div className="text-dark-muted text-xs uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-dark-muted text-xs mt-1">{sub}</div>}
    </div>
  );
}
