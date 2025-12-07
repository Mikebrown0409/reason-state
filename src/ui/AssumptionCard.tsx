import React from "react";

type AssumptionCardProps = {
  title: string;
  status?: string;
  subtitle?: string;
  children?: React.ReactNode;
};

export function AssumptionCard({ title, status, subtitle, children }: AssumptionCardProps) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        padding: "10px",
        marginBottom: "8px"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 600 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: "#64748b" }}>{subtitle}</div>}
        </div>
        {status && (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "12px",
              fontSize: 12,
              background: status === "valid" ? "#dcfce7" : "#fee2e2",
              color: status === "valid" ? "#166534" : "#991b1b"
            }}
          >
            {status}
          </span>
        )}
      </div>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

