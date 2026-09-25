# Source assets

`logo.png` is the supplied artwork: 1254 × 1254, 24-bit RGB, with a solid
background and no alpha channel. It is the design source for the mark, and the
source the shipped favicon is generated from.

## What ships, and where

| File | Purpose | Size |
| --- | --- | --- |
| `src/app/icon.png` | Browser tab, bookmarks, and every other place a favicon is fetched from | 512 × 512 |
| `src/app/apple-icon.png` | iOS home-screen tile | 180 × 180 |
| `src/components/ui/brand-mark.tsx` | The vector mark drawn inside the app | inline SVG |

Both PNGs are downscaled from `logo.png` with a high-quality bicubic filter and
committed. They are not generated at build time: a build step that shells out to
a rasteriser would add a toolchain dependency for two static files, and the
output would be byte-identical on every machine anyway.

They must be **squared** rather than merely scaled. `src/app/icon.svg` and
`src/app/apple-icon.tsx` are gone, and that is not tidying: each of those and its
PNG counterpart resolves to the same route, so leaving both in place is a
conflict rather than a duplicate.

## Why the icons and the in-app mark are different files

The artwork is a raster PNG at one size. The in-app mark is a hand-written SVG
path, because it has to be recoloured by CSS, sit at 28px in the sidebar and at
96px on the sign-in screen, and stay crisp at every size in between — none of
which a single 1254px bitmap does well. Reusing the PNG inside the app would
mean a blurry logo on a retina display.

The icons are the reverse case. A favicon is fetched once, cached hard by the
browser, and rendered at 16–32px where the 512px original is the smallest
practical size, and `apple-touch-icon` is a fixed 180 × 180 with no display
attribute and no way to ask for a different one.

Both the PNG and the SVG come from the same artwork, so the two are the same
cross in the same proportions at different fidelities.

## Note on the background

The source has no alpha channel, so the cross is not a floating mark but a
square. Two consequences worth knowing:

- On iOS this is required, not merely acceptable. `apple-touch-icon` is composited
  over an opaque tile and a transparent icon is rendered against black.
- In a browser tab the square will be shown as a square. Some platforms apply
  their own mask, most do not. The previous SVG had an explicit `rx="7"` rounded
  corner; the PNG does not, and rounding it would mean baking a shape that most
  browsers will round again anyway.
