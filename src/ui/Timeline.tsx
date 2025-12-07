import React from "react";
import { motion } from "framer-motion";

type TimelineProps = {
  items: string[];
  active?: number;
};

export function Timeline({ items, active = items.length - 1 }: TimelineProps) {
  return (
    <div style={{ border: "1px solid #ddd", padding: "8px", borderRadius: "8px" }}>
      {items.map((item, idx) => (
        <motion.div
          key={item + idx}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: idx * 0.05 }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: 4,
            color: idx === active ? "#0f172a" : "#475569",
            fontWeight: idx === active ? 600 : 400
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: idx <= active ? "#2563eb" : "#cbd5e1" }} />
          <span>{item}</span>
        </motion.div>
      ))}
    </div>
  );
}

