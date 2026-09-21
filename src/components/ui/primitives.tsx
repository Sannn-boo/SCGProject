"use client";

import type { CSSProperties, ReactNode } from "react";

export const panel: CSSProperties = {
  background: "var(--glass)",
  backdropFilter: "blur(var(--blur)) saturate(140%)",
  WebkitBackdropFilter: "blur(var(--blur)) saturate(140%)",
  border: "1px solid var(--glass-border)",
  borderRadius: "var(--radius)",
  boxShadow: "var(--shadow-md)",
};

export function Panel({
  children,
  style,
  pad = 18,
}: {
  children: ReactNode;
  style?: CSSProperties;
  pad?: number;
}) {
  return (
    <div className="glass-panel" style={{ ...panel, padding: pad, ...style }}>
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  style,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "quiet";
  disabled?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  const base: CSSProperties = {
    borderRadius: "var(--radius-pill)",
    padding: "9px 17px",
    font: "500 13px/1 var(--sans)",
    transition: "opacity .15s ease, background .15s ease",
    opacity: disabled ? 0.45 : 1,
    pointerEvents: disabled ? "none" : "auto",
  };
  const variants: Record<string, CSSProperties> = {
    primary: {
      border: 0,
      background: "var(--grad-accent)",
      color: "var(--accent-ink)",
      boxShadow: "var(--shadow-glow)",
    },
    ghost: {
      border: "1px solid var(--glass-border)",
      background: "var(--glass)",
      backdropFilter: "blur(var(--blur))",
      WebkitBackdropFilter: "blur(var(--blur))",
      color: "var(--ink)",
    },
    quiet: {
      border: 0,
      background: "transparent",
      color: "var(--muted)",
    },
  };
  const classNames: Record<string, string> = {
    primary: "btn-primary",
    ghost: "btn-ghost",
    quiet: "btn-quiet", // เติมคลาสให้ปุ่มใส
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={classNames[variant]}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

export function Label({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        font: "500 11px/1.3 var(--mono)",
        letterSpacing: ".04em",
        textTransform: "uppercase",
        color: "var(--muted)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  hint,
  big = false,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  big?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div
        style={{
          font: `${big ? 600 : 500} ${big ? 34 : 19}px/1.1 var(--mono)`,
          marginTop: 7,
          color: "var(--ink)",
        }}
      >
        {value}
        {unit && (
          <span
            style={{
              font: "400 13px/1 var(--mono)",
              color: "var(--muted)",
              marginLeft: 5,
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <div
          style={{
            font: "400 11.5px/1.45 var(--sans)",
            color: "var(--muted)",
            marginTop: 5,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

export function Caveat({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 9,
        padding: "10px 12px",
        borderRadius: 12,
        background: "var(--glass)",
        backdropFilter: "blur(var(--blur))",
        WebkitBackdropFilter: "blur(var(--blur))",
        border: "1px solid var(--glass-border)",
        font: "400 12px/1.55 var(--sans)",
        color: "var(--muted)",
      }}
    >
      <span style={{ color: "var(--warn)", flexShrink: 0 }}>▲</span>
      <div>{children}</div>
    </div>
  );
}

export function ScreenHeader({
  tag,
  title,
  desc,
  onBack,
}: {
  tag: string;
  title: string;
  desc?: string;
  onBack?: () => void;
}) {
  return (
    <div className="section-header" style={{ position: "relative" }}>
      {onBack && (
        <div style={{ position: "absolute", left: 0, top: 0 }}>
          <Button variant="ghost" onClick={onBack}>
            ← Back
          </Button>
        </div>
      )}
      <span className="section-tag">{tag}</span>
      <h2 className="section-title">{title}</h2>
      {desc && <p className="section-desc">{desc}</p>}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span style={{ font: "400 12px/1 var(--sans)", color: "var(--muted)" }}>
          {label}
        </span>
        <span style={{ font: "500 12px/1 var(--mono)", color: "var(--ink)" }}>
          {value.toFixed(step < 1 ? 2 : 0)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}