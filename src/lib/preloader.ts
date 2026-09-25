/**
 * The splash is deliberately shown once per browser tab rather than once per
 * page load, so the key lives in `sessionStorage` (cleared when the tab closes)
 * instead of `localStorage` (which would hide it for the rest of the day).
 */
export const PRELOADER_STORAGE_KEY = "confession:splash-seen";

/**
 * Runs before the splash element is parsed so that a returning visitor never
 * sees a frame of it. The sessionStorage read has to happen synchronously in
 * the document head region — deferring it to an effect would show the splash and
 * then hide it, which is exactly the flash this is meant to avoid.
 *
 * `html[data-preloader="seen"]` is what the stylesheet keys off, and setting an
 * attribute (rather than removing the node) means no layout work is required
 * before the first paint.
 */
export const PRELOADER_GUARD_SCRIPT = `try{sessionStorage.getItem(${JSON.stringify(
  PRELOADER_STORAGE_KEY,
)})&&(document.documentElement.dataset.preloader="seen")}catch(e){}`;
