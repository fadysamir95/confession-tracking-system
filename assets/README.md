# Source assets

`logo.png` is the original artwork the Coptic cross in the interface was drawn
from. Nothing imports it — the mark that ships is the vector path in
`src/components/ui/brand-mark.tsx`, and the favicon is `src/app/icon.svg` — so
it is kept here as the design source rather than as a build input.

Keeping it means the proportions and the geometry of the cross can be checked
against what was approved, and redrawn if a different size is ever needed,
without going back to whoever produced the original.
