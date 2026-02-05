interface SeverityBadgeProps {
  severity: string;
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const colors =
    severity === "critical"
      ? "bg-red-900/50 text-red-300 border-red-700"
      : "bg-yellow-900/50 text-yellow-300 border-yellow-700";

  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${colors}`}
    >
      {severity}
    </span>
  );
}
