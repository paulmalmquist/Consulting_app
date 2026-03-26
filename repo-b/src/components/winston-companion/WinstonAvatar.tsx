"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";

export default function WinstonAvatar({
  className,
  imageClassName,
  priority = false,
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
      <Image
        src="/winstonpic.png"
        alt="Winston"
        fill
        sizes="(max-width: 768px) 56px, 64px"
        priority={priority}
        className={cn("object-contain p-[16%]", imageClassName)}
      />
    </div>
  );
}
