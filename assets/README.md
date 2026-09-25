# Source assets

`logo.png` is the supplied artwork: 1254 × 1254, 24-bit RGB, with a solid
background and no alpha channel. It is the design source for every image the
product ships, and none of those images is generated at build time.

## What ships, and where

| File | Purpose | Size |
| --- | --- | --- |
| `src/app/icon.png` | Browser tab, bookmarks, and every other place a favicon is fetched from | 512 × 512 |
| `src/app/apple-icon.png` | iOS home-screen tile | 180 × 180 |
| `public/brand-mark.png` | The in-app mark: sidebar, mobile header, sign-in, splash | 256 × 256 |

All three are high-quality bicubic downscales of `logo.png` and are committed.
They are not produced by a build step: a step that shells out to a rasteriser
would add a toolchain dependency for three static files, and the output would be
byte-identical on every machine anyway.

`256 × 256` for the in-app mark is chosen against its largest use, not against
the source. The splash tile is 78 CSS px, so 256px is about 3.3× that — sharp on
a retina display, without shipping 980KB of pixels no screen can resolve.

The icons must be **squared** rather than merely scaled. `src/app/icon.svg` and
`src/app/apple-icon.tsx` are gone, and that is not tidying: each of those and its
PNG counterpart resolves to the same route, so leaving both in place is a
conflict rather than a duplicate.

## The artwork's actual structure

Worth recording, because it is not what the first look suggests. Sampling the
source shows the background is a near-white plate (`#FCFCFC`–`#FFFFFF`, 63% of
pixels) and that the mark itself is **two** distinct elements, not one:

| Ink level | Share | What it is |
| --- | --- | --- |
| 0–3 | 62.8% | the white plate |
| 8–51 | 18.7% | a pale gold outer element — a halo, outline, or backing shape |
| 108–119 | 0.9% | a thin mid-tone band between the two |
| 160–255 | 12.5% | the dark gold cross proper |

The gaps at 52–107 and 120–159 are empty, which is what makes these separate
elements rather than one continuous gradient. The artwork spans 68% of the canvas
width and 78% of its height, centred on both axes, and its dominant colour is
`#B48937`.

## Why the mark is not a knockout of the white plate

It would be reasonable to assume the background should be made transparent and
the bare cross placed on the app's green tile, the way the old vector mark was.
That was tried and the result discarded, for two reasons.

The obvious method is wrong for this image. Treating the plate as white and
solving for coverage gives `alpha = 1 - min(R,G,B)`, because the smallest channel
is the only one the backdrop fully contributes to. But solid gold `#B48937` has a
blue channel of 55, so *every* interior pixel of the cross reads as 78% coverage
— the whole mark would come out faintly translucent and look bleached. Worse, the
pale-gold outer element tops out around ink 51, so any threshold that fixes the
cross also has to be low enough to keep that element opaque, leaving almost no
room for a soft edge.

And the payoff was small. The plate is near-white and the sidebar, mobile header
and sign-in panel are all near-white, so on those three surfaces a transparent
mark and a white-plate mark are very nearly the same pixels. Only the splash
screen is dark, and a white plate reads as an intentional badge there.

So the plate is kept, scaled to fill its tile with `object-fit: cover`, and the
tile's `border-radius` is what rounds the plate's corners. The green behind the
image in `.brand__mark` is never visible; it is kept only so that a missing file
leaves a coloured tile rather than a hole.

If a transparent mark is ever wanted, it should be produced from a source that
carries an alpha channel, not recovered from this one.

## Note on the square edges

The source has no alpha channel, so the mark is not a floating shape but a
square. Two consequences worth knowing:

- On iOS this is required, not merely acceptable. `apple-touch-icon` is composited
  over an opaque tile and a transparent icon is rendered against black.
- In a browser tab the square will be shown as a square. Some platforms apply
  their own mask, most do not. The previous SVG had an explicit `rx="7"` rounded
  corner; the PNG does not, and rounding it would mean baking a shape that most
  browsers will round again anyway.

Inside the app the square is not visible, because `.brand__mark` and
`.preloader__mark` clip the image to a rounded box.

## The vector mark that this replaced

`src/components/ui/brand-mark.tsx` used to be a hand-written inline SVG of a
Coptic cross — three crossbars of increasing width, a shaft flaring toward its
base, crossbar ends bowing inward. It was the right choice while the mark was a
placeholder, because it was exact at any size and inherited `currentColor`.

A real logo ends both arguments. A raster cannot inherit the theme and cannot be
restyled for a surface it was not drawn for, and at 25–48 CSS px a downscale of
a 1254px source is sharper than any vector, not blurrier. The vector and its
exported `COPTIC_CROSS_PATH` are deleted rather than left as dead code.
