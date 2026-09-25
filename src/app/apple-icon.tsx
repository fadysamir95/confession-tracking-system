import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * The iOS home-screen tile. `icon.svg` covers browser tabs, but Safari on iOS
 * only ever looks for an `apple-touch-icon`, and it will not fall back to an
 * SVG or even to a small PNG. Generating it here keeps a single source of truth
 * for the artwork: the same Coptic cross proportions as the in-app logo, drawn
 * with plain boxes because the SVG renderer used for OG images has no path
 * support and drawing a concave-ended cross is not worth faking.
 */
export default function AppleIcon() {
  const gold = "#e8c87a";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#176b5d",
          borderRadius: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            width: 22,
            height: 152,
            background: gold,
          }}
        >
          <div style={{ width: 76, height: 16, background: gold, borderRadius: 8 }} />
          <div style={{ width: 112, height: 19, background: gold, borderRadius: 10 }} />
          <div style={{ width: 148, height: 23, background: gold, borderRadius: 12 }} />
        </div>
      </div>
    ),
    size,
  );
}
