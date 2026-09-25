import type { SVGProps } from "react";

/**
 * The Coptic cross, drawn rather than photographed so it stays razor sharp at
 * every size from a 16px browser tab to a 512px app tile.
 *
 * The silhouette carries the three features that make the shape recognisable as
 * a Coptic cross rather than a generic Latin one: three crossbars of increasing
 * width (titulus, arm, footrest), a shaft that flares toward its base, and
 * crossbar ends that bow inward instead of ending square.
 *
 * The path is expressed in a 64x64 box and drawn in a single fill so it can be
 * recoloured by CSS with `currentColor` and reused on light and dark surfaces.
 */
export const COPTIC_CROSS_PATH = [
  // Shaft: a touch wider at the foot than at the head, as on the traditional
  // form, which gives the whole mark a sense of standing rather than hanging.
  "M28.5 4H35.5L36.8 60H27.2Z",
  // Titulus — the narrow top bar.
  "M20 13H44Q41 15.5 44 18H20Q23 15.5 20 13Z",
  // The main crossbar.
  "M13 25H51Q47 28 51 31H13Q17 28 13 25Z",
  // Footrest — the wide base bar.
  "M9 48H55Q50 51.5 55 55H9Q14 51.5 9 48Z",
].join("");

export function BrandMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={COPTIC_CROSS_PATH} fill="currentColor" />
    </svg>
  );
}
