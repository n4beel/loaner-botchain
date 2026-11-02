import { HTMLAttributes } from "react";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  noPadding?: boolean;
  archival?: boolean;
}

export default function Panel({
  elevated = false,
  noPadding = false,
  archival = false,
  children,
  className = "",
  style,
  ...props
}: PanelProps) {
  return (
    <div
      className={[
        "relative rounded-sm transition-all",
        archival ? "catalogue-slip" : "border",
        noPadding ? "" : "p-6",
        className,
      ].join(" ")}
      style={{
        backgroundColor: elevated ? "var(--bg-elevated)" : "var(--bg-surface)",
        borderColor: "var(--border-default)",
        boxShadow: elevated
          ? "0 4px 14px rgba(46, 31, 20, 0.08)"
          : "0 1px 4px rgba(46, 31, 20, 0.04)",
        ...style,
      }}
      {...props}
    >
      {/* Subtle corner document indexing mark */}
      {archival && (
        <span
          className="absolute top-2 right-3 font-mono text-[9px] uppercase tracking-widest pointer-events-none select-none"
          style={{ color: "var(--text-tertiary)" }}
        >
          CATALOGUE RECORD
        </span>
      )}
      {children}
    </div>
  );
}
export { Panel };
