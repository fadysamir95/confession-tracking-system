import type { ImgHTMLAttributes } from "react";

/**
 * The mark beside the app name: the parish's own logo, from `assets/logo.png`,
 * committed at `public/brand-mark.png` as a 256px high-quality downscale of the
 * 1254px original. 256px is about 3.3x the largest box the mark is ever painted
 * into — the 78px preloader tile — so it stays sharp on a retina screen without
 * shipping 980KB of pixels that no display can resolve.
 *
 * This replaces a hand-drawn inline SVG of a Coptic cross. The vector was the
 * right call for as long as the mark was a placeholder: it was exact at any
 * size and it recoloured with `currentColor`. Neither advantage survives a real
 * logo, and both cost something — a raster cannot inherit the theme, and it
 * cannot be restyled if the parish later wants the mark in its own ink on a
 * surface it was not drawn for. The supplied artwork is the single source of
 * truth now; the vector is deleted rather than left as dead code.
 *
 * `public/` rather than a hashed import: the mark is decorative, and a stable
 * URL that the smoke test can assert on is worth more here than a build-hash
 * dependency in four call sites.
 *
 * A plain `<img>` rather than `next/image` — the optimiser's responsive pipeline
 * and its extra request have nothing to offer a mark that is always decorative
 * and never larger than 78 CSS px. The `width`/`height` below are the file's
 * intrinsic size; CSS stretches it to the tile, and every tile is fixed, so
 * nothing shifts on load.
 */
export function BrandMark(props: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see the note above
    <img src="/brand-mark.png" alt="" width={256} height={256} {...props} />
  );
}
