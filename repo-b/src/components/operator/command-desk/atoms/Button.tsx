import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

export type ButtonKind = "primary" | "accent" | "magenta" | "secondary" | "danger" | "ghost";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

type ButtonProps = {
  kind?: ButtonKind;
  size?: ButtonSize;
  icon?: ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
  children: ReactNode;
};

const SIZES: Record<ButtonSize, { h: number; px: number; fs: number }> = {
  xs: { h: 22, px: 8,  fs: 10 },
  sm: { h: 24, px: 10, fs: 10 },
  md: { h: 28, px: 14, fs: 11 },
  lg: { h: 32, px: 18, fs: 12 },
};

function kindStyle(kind: ButtonKind, hover: boolean) {
  switch (kind) {
    case "primary":
      return {
        bg: "var(--neon-cyan)",
        color: "var(--bg-void)",
        border: "var(--neon-cyan)",
        shadow: hover
          ? "0 0 0 1px rgba(0,229,255,.4),0 0 20px rgba(0,229,255,.55)"
          : "0 0 0 1px rgba(0,229,255,.25),0 0 14px rgba(0,229,255,.35)",
      };
    case "accent":
      return {
        bg: hover ? "rgba(0,229,255,.1)" : "transparent",
        color: "var(--neon-cyan)",
        border: "var(--neon-cyan)",
        shadow: hover ? "0 0 12px rgba(0,229,255,.35)" : "none",
      };
    case "magenta":
      return {
        bg: hover ? "rgba(255,46,154,.1)" : "transparent",
        color: "var(--neon-magenta)",
        border: "var(--neon-magenta)",
        shadow: hover ? "0 0 12px rgba(255,46,154,.35)" : "none",
      };
    case "danger":
      return {
        bg: hover ? "rgba(255,59,92,.12)" : "transparent",
        color: "var(--sem-down)",
        border: "var(--sem-down)",
        shadow: hover ? "0 0 12px rgba(255,59,92,.4)" : "none",
      };
    case "ghost":
      return {
        bg: hover ? "var(--bg-row-hover)" : "transparent",
        color: hover ? "var(--fg-1)" : "var(--fg-2)",
        border: "transparent",
        shadow: "none",
      };
    case "secondary":
    default:
      return {
        bg: hover ? "var(--bg-row-hover)" : "transparent",
        color: "var(--fg-1)",
        border: hover ? "var(--fg-3)" : "var(--line-3)",
        shadow: "none",
      };
  }
}

export function Button({
  kind = "secondary",
  size = "md",
  icon,
  onClick,
  title,
  disabled,
  type = "button",
  style,
  children,
}: ButtonProps) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const s = SIZES[size];
  const k = kindStyle(kind, hover && !disabled);

  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPress(false);
      }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: s.fs,
        fontWeight: 500,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        padding: `0 ${s.px}px`,
        height: s.h,
        lineHeight: 1,
        borderRadius: 3,
        background: k.bg,
        color: k.color,
        border: `1px solid ${k.border}`,
        boxShadow: k.shadow,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 80ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        transform: press ? "translateY(1px)" : "none",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {icon}
      {children}
    </button>
  );
}
