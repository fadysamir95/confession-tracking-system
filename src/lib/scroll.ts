/**
 * Scrolling, with the reader's motion preference respected.
 *
 * The stylesheet already turns off `scroll-behavior` under
 * `prefers-reduced-motion: reduce`, but that only covers scrolling the browser
 * performs on its own — an in-page anchor, a focus jump, a back-navigation
 * restore. A programmatic `scrollIntoView({ behavior: "smooth" })` is an
 * explicit instruction and runs regardless of the stylesheet, so a reader who
 * has asked the operating system to stop moving things on screen would still be
 * scrolled there smoothly.
 *
 * The two behaviours are read once per call rather than cached: a reader can
 * change the setting while the page is open, and the cost is a media-query
 * lookup that is already resolved.
 */
function preferredBehavior(): ScrollBehavior {
  if (typeof window === "undefined" || !window.matchMedia) return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

export function scrollIntoView(
  target: Element | null,
  block: ScrollLogicalPosition = "start",
): void {
  target?.scrollIntoView({ behavior: preferredBehavior(), block });
}
