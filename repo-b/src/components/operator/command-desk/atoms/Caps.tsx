import type { CSSProperties, ReactNode } from "react";

type CapsProps = {
  children: ReactNode;
  color?: string;
  size?: number;
  style?: CSSProperties;
};

export function Caps({ children, color = "var(--fg-3)", size = 10, style }: CapsProps) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: size,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        color,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
