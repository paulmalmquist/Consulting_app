import { ImageResponse } from "next/og";

export const alt = "Prepared by Novendor";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function humanize(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export default function OgImage({ params }: { params: { slug: string } }) {
  const firm = humanize(params.slug || "");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0b0f16",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#7dd3fc",
          }}
        >
          Prepared by Novendor for
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, marginTop: 16 }}>
          {firm || "Your firm"}
        </div>
        <div style={{ fontSize: 28, color: "rgba(255,255,255,0.6)", marginTop: 24 }}>
          Controlled internal systems, shown as working software.
        </div>
      </div>
    ),
    { ...size },
  );
}
