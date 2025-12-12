import React, { useEffect, useRef } from "react";
import type { StudioStep } from "../sampleTrace";

type Props = {
  steps: StudioStep[];
  active: number;
  onSelect: (idx: number) => void;
  onRetract?: (idx: number) => void;
  onRollback?: (idx: number) => void;
};

export function Timeline(props: Props) {
  const total = props.steps.length;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wheelCooldown = useRef(false);
  const wheelAccumulator = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (wheelCooldown.current) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      wheelAccumulator.current += delta;
      const stepThreshold = 4;
      if (wheelAccumulator.current >= stepThreshold) {
        props.onSelect((props.active + 1) % total);
        wheelAccumulator.current = 0;
      } else if (wheelAccumulator.current <= -stepThreshold) {
        props.onSelect((props.active - 1 + total) % total);
        wheelAccumulator.current = 0;
      }
      wheelCooldown.current = true;
      setTimeout(() => {
        wheelCooldown.current = false;
      }, 60);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [props.active, props.onSelect, total]);

  return (
    <div className="carousel" ref={containerRef}>
      {props.steps.map((step, idx) => {
        const rawOffset = idx - props.active;
        let offset = ((rawOffset % total) + total) % total; // 0..total-1
        if (offset > total / 2) offset -= total;
        const clamped = Math.min(Math.max(offset, -2), 2);
        const translate = clamped * 220; // space so edges of neighbors peek
        const scale = clamped === 0 ? 1 : clamped === 1 || clamped === -1 ? 0.94 : 0.9;
        // keep depth via scale/blur, but cards stay fully opaque
        const opacity = 1;
        const blur = clamped === 0 ? "0px" : clamped === 1 || clamped === -1 ? "0.4px" : "0.9px";
        const zIndex = clamped === 0 ? 20 : 20 - Math.abs(clamped);
        const rotate = 0;
        const hide = Math.abs(offset) > 2;
        const nodes = Object.values(step.state.raw);
        const shown = nodes.slice(0, 3);
        const overflow = nodes.length - shown.length;
        const unknownCount = (step.state.unknowns ?? []).length + nodes.filter((n: any) => n.type === "unknown").length;
        const dirtyCount = nodes.filter((n: any) => n.dirty).length;
        const blockedCount = nodes.filter((n: any) => n.status === "blocked").length;
        const prev = idx > 0 ? props.steps[idx - 1] : undefined;
        return (
          <div
            key={idx}
            className={`card ${props.active === idx ? "active" : ""}`}
            onClick={() => props.onSelect(idx)}
            style={{
              transform: hide
                ? "translateZ(-400px) scale(0.8)"
                : `translateX(${translate}px) rotateY(${rotate}deg) scale(${scale})`,
              opacity: hide ? 0 : opacity,
              filter: hide ? "blur(2px)" : `blur(${blur})`,
              zIndex,
            }}
          >
            <h3>{step.label}</h3>
            {step.adapted ? <div className="badge" style={{ marginBottom: 6 }}>Auto-adapted</div> : null}
            <div className="muted">Patches: {step.patches.length}</div>
            <div className="chips-row" style={{ marginTop: 6, gap: 6 }}>
              {unknownCount > 0 && <div className="node-chip blocked">Unknown: {unknownCount}</div>}
              {dirtyCount > 0 && <div className="node-chip dirty">Dirty: {dirtyCount}</div>}
              {blockedCount > 0 && <div className="node-chip blocked">Blocked: {blockedCount}</div>}
            </div>
            <div className="chips-row" style={{ marginTop: 10 }}>
              {shown.map((node) => (
                <div
                  key={node.id}
                  className={`node-chip ${node.status === "blocked" ? "blocked" : ""} ${
                    node.dirty ? "dirty" : ""
                  }`}
                >
                  {node.type}: {node.summary ?? node.id}
                </div>
              ))}
              {overflow > 0 && <div className="node-chip muted">+{overflow} more</div>}
            </div>
            <div className="chips-row" style={{ marginTop: 10, gap: 8 }}>
              {props.onRetract && (
                <button className="button ghost" style={{ padding: "6px 10px" }} onClick={(e) => { e.stopPropagation(); props.onRetract?.(idx); }}>
                  Retract
                </button>
              )}
              {props.onRollback && (
                <button className="button ghost" style={{ padding: "6px 10px" }} onClick={(e) => { e.stopPropagation(); props.onRollback?.(idx); }}>
                  Rollback
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

