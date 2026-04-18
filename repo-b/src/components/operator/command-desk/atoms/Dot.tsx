import type { CSSProperties } from "react";

type DotProps = {
  color?: string;
  glow?: boolean;
  size?: number;
  style?: CSSProperties;
};

export function Dot({ color = "var(--neon-cyan)", glow = true, size = 6, style }: DotProps) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        boxShadow: glow ? `0 0 6px ${color}` : "none",
        flex: "none",
        ...style,
      }}
    />
  );
}
