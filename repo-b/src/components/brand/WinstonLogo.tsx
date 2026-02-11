"use client";

import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number };

export default function WinstonLogo({ size = 32, ...rest }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      fill="none"
      width={size}
      height={size}
      aria-hidden
      {...rest}
    >
      <rect width="40" height="40" rx="8" fill="#0a0e1a" />
      <path
        d="M8 28L14 12h3l4 10 4-10h3l6 16h-3.5l-4-11-4 11h-3l-4-11-4 11H8z"
        fill="#1cd8d2"
      />
      <rect x="6" y="30" width="28" height="2.5" rx="1.25" fill="#1cd8d2" opacity="0.5" />
    </svg>
  );
}
