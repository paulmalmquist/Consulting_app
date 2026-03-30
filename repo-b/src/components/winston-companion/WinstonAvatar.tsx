"use client";

import { cn } from "@/lib/cn";

export function WinstonBowtieIcon(
  props: React.SVGProps<SVGSVGElement>
) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M2 6.5L11 11.2V12.8L2 17.5L4.3 12L2 6.5Z"
        fill="currentColor"
      />
      <path
        d="M22 6.5L13 11.2V12.8L22 17.5L19.7 12L22 6.5Z"
        fill="currentColor"
      />
      <rect
        x="11"
        y="10"
        width="2"
        height="4"
        rx="0.4"
        fill="currentColor"
      />
    </svg>
  );
}

export default function WinstonAvatar({
  className,
  imageClassName,
  priority: _priority = false,
}: {
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-full border border-black/8 bg-white shadow-[0_8px_24px_-18px_rgba(15,23,42,0.75)]",
        "ring-1 ring-bm-border/45",
        className,
      )}
    >
      <div className="flex h-full w-full items-center justify-center">
        <WinstonBowtieIcon
          className={cn("h-[58%] w-[58%] text-black", imageClassName)}
        />
      </div>
    </div>
  );
}
