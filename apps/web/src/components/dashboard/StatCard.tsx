export function StatCard({
  label,
  value,
  lockedUntilPhase,
}: {
  label: string;
  value?: string | number;
  lockedUntilPhase?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <p className="text-xs text-foreground/50">{label}</p>
      {lockedUntilPhase ? (
        <p className="mt-1 text-sm text-foreground/30">
          Unlocks in {lockedUntilPhase}
        </p>
      ) : (
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      )}
    </div>
  );
}
