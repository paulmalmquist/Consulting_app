import { forwardRef, useState } from "react";
import type { CSSProperties, KeyboardEventHandler } from "react";

type FieldProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  mono?: boolean;
  height?: number;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  autoFocus?: boolean;
  style?: CSSProperties;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { value, onChange, placeholder, prefix, suffix, mono = true, height = 28, onKeyDown, autoFocus, style },
  ref,
) {
  const [focus, setFocus] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "var(--bg-inset)",
        border: `1px solid ${focus ? "var(--neon-cyan)" : "var(--line-2)"}`,
        borderRadius: 3,
        height,
        boxShadow: focus ? "0 0 0 1px rgba(0,229,255,.3),0 0 12px rgba(0,229,255,.2)" : "none",
        transition: "all 80ms",
        ...style,
      }}
    >
      {prefix && (
        <span
          style={{
            padding: "0 8px",
            color: "var(--neon-magenta)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
          }}
        >
          {prefix}
        </span>
      )}
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        style={{
          flex: 1,
          background: "transparent",
          border: 0,
          outline: "none",
          color: "var(--fg-1)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          fontSize: 11,
          padding: "0 10px",
          paddingLeft: prefix ? 0 : 10,
          height: "100%",
          minWidth: 0,
        }}
      />
      {suffix && (
        <span
          style={{
            padding: "0 8px",
            color: "var(--fg-3)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: ".08em",
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
});
