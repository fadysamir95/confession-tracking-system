/**
 * Whether the reader has dismissed the "recently recorded" card.
 *
 * `localStorage` and not `sessionStorage`, unlike the splash. The splash is a
 * once-per-tab animation and reappearing in a new tab is correct. This is a
 * decision about how the dashboard should look, and a priest who cleared the
 * card meant it — reopening the tab tomorrow should not hand it back.
 *
 * The key is not namespaced per reader or per parish. It could not be: the
 * script that reads it runs in the document head, before any request has
 * resolved and before there is a user id to put in the key. Two readers sharing
 * a browser profile therefore share the dismissal. That is a display preference
 * with no data in it, so the cost is a card each of them can bring back, not a
 * disclosure.
 */
export const RECENT_CARD_STORAGE_KEY = "confession:recent-card-hidden";

/**
 * Runs before the card is parsed so a dismissal takes effect on the first paint.
 *
 * The `localStorage` read has to happen synchronously in the head region.
 * Reading it in an effect instead would mean the card is server-rendered, shown
 * for a frame, and then removed — the same flash the splash guard exists to
 * prevent, and the reason `html[data-recent="hidden"]` is what the stylesheet
 * keys off rather than a conditional in the component. Setting an attribute
 * instead of removing a node means no layout work before the first paint.
 */
export const RECENT_CARD_GUARD_SCRIPT = `try{localStorage.getItem(${JSON.stringify(
  RECENT_CARD_STORAGE_KEY,
)})&&(document.documentElement.dataset.recent="hidden")}catch(e){}`;

/**
 * The store behind the dismissal, exposed as a `useSyncExternalStore` source.
 *
 * `useState` seeded from an effect would be the obvious way to write this and is
 * the wrong one: it renders the card, then hides it, and React's own lint rules
 * reject it for the cascading render that causes. This is a genuine external
 * store — the value lives in the browser, not in React — so it is read and
 * subscribed to as one, which also means a dismissal made in one tab reaches the
 * others instead of leaving each tab with its own answer.
 */

/** `null` until the first read, so the value is parsed once per page, not per render. */
let cached: boolean | null = null;

const listeners = new Set<() => void>();

let storageBound = false;

function read(): boolean {
  if (cached === null) {
    try {
      cached = window.localStorage.getItem(RECENT_CARD_STORAGE_KEY) === "1";
    } catch {
      // A browser that refuses localStorage reads still gets a working card; it
      // just will not remember the dismissal.
      cached = false;
    }
  }
  return cached;
}

function emit() {
  // Copied, because a listener may unsubscribe during the walk — and React does
  // exactly that when a store notifies while a render is in flight.
  for (const listener of [...listeners]) listener();
}

export function isRecentCardHidden(): boolean {
  // The server has no storage, and must not be asked to guess: this is the
  // `getServerSnapshot` half of the pair, and it is what makes the first render
  // match the markup React hydrates against.
  return typeof window === "undefined" ? false : read();
}

/**
 * Show or hide the card, and keep the two records of the decision in step.
 *
 * `localStorage` and the `data-recent` attribute are both written because both
 * are read: the attribute by the stylesheet on the next first paint, the key by
 * this store and by the guard script on the next page load. Moving one without
 * the other is how a card ends up hidden by CSS but rendered by React, or
 * remembered in storage but visible on the next visit.
 */
export function setRecentCardHidden(hidden: boolean): void {
  cached = hidden;

  try {
    if (hidden) window.localStorage.setItem(RECENT_CARD_STORAGE_KEY, "1");
    else window.localStorage.removeItem(RECENT_CARD_STORAGE_KEY);
  } catch {
    // As above: the card still responds, it just forgets.
  }

  if (hidden) document.documentElement.dataset.recent = "hidden";
  else document.documentElement.removeAttribute("data-recent");

  emit();
}

export function subscribeRecentCard(listener: () => void): () => void {
  if (!storageBound) {
    storageBound = true;
    // The `storage` event fires in *other* tabs only, never the one that wrote.
    // That is the half `emit` does not cover, so without this a priest who
    // dismissed the card in one window would still see it in the other, with no
    // way to explain the difference. The cache is dropped rather than updated
    // from the event, because the new value has to come from storage.
    window.addEventListener("storage", (event) => {
      if (event.key !== RECENT_CARD_STORAGE_KEY) return;
      cached = null;
      emit();
    });
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
