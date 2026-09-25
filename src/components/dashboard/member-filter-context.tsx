"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MemberFilter } from "@/lib/member-filters";
import { scrollIntoView } from "@/lib/scroll";

/**
 * The roster filter, shared between the attention queues and the roster itself.
 *
 * These are two views of one question. A priest who sees "3 overdue" in a queue
 * and then has to re-select "Overdue" in the filter bar to read those three is
 * being asked the same thing twice, and the answer they already gave is the one
 * that should carry over. Owning the filter above both of them is what lets a
 * queue set it.
 *
 * Two operations rather than one, because "change the filter" and "change the
 * filter and take me there" are different requests. The filter bar is already
 * on screen when a chip is pressed, so scrolling there would be a jolt; the
 * queues are somewhere above the roster, so scrolling is the whole point.
 */
type MemberFilterValue = {
  filter: MemberFilter;
  /** Change the filter, where the reader already is. */
  setFilter: (next: MemberFilter) => void;
  /** Change the filter, then bring the roster into view. */
  goToFilter: (next: MemberFilter) => void;
};

const MemberFilterContext = createContext<MemberFilterValue | null>(null);

export function MemberFilterProvider({
  initialFilter,
  children,
}: {
  initialFilter: MemberFilter;
  children: ReactNode;
}) {
  const [filter, setFilterState] = useState<MemberFilter>(initialFilter);

  const setFilter = useCallback((next: MemberFilter) => {
    setFilterState(next);
  }, []);

  const goToFilter = useCallback((next: MemberFilter) => {
    setFilterState(next);

    // The address bar is kept in step with `history.replaceState` rather than a
    // navigation. A real link would reload the page and re-run every query to
    // arrive at a view the client already has, and it would push an entry the
    // reader did not ask to be able to go back to — pressing Back should leave
    // the dashboard, not undo a filter they have already seen applied.
    const url = new URL(window.location.href);
    if (next === "ALL") url.searchParams.delete("filter");
    else url.searchParams.set("filter", next);
    window.history.replaceState(null, "", url);

    // The roster is the destination, so it is the target. `scroll-margin-top`
    // on the section handles the sticky mobile header sitting over the top of
    // the viewport; without it the section's own heading would arrive hidden
    // underneath it, which is the one outcome a scroll must never have.
    scrollIntoView(document.getElementById("members"));
  }, []);

  const value = useMemo(
    () => ({ filter, setFilter, goToFilter }),
    [filter, setFilter, goToFilter],
  );

  return (
    <MemberFilterContext.Provider value={value}>{children}</MemberFilterContext.Provider>
  );
}

export function useMemberFilter(): MemberFilterValue {
  const value = useContext(MemberFilterContext);
  if (!value) {
    throw new Error(
      "useMemberFilter was called outside a MemberFilterProvider. The attention " +
        "queues and the roster share one filter, so both have to sit inside the " +
        "provider the dashboard page renders.",
    );
  }
  return value;
}
