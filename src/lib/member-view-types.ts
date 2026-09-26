import type { MemberListItem } from "@/lib/member-domain";

export type DashboardMember = MemberListItem & {
  /**
   * WhatsApp with the parish's saved reminder already written into it, or `null`
   * for a member who is not to be reminded.
   *
   * `null` is decided by the query, not by the component: the template states how
   * many days late the member is, so building it for someone who is not late
   * would put the parish's wording — with that member's name in it — into the
   * page for a control that must never be pressed. A component that wants the
   * button therefore tests for the link's presence and nothing else, and cannot
   * get the rule wrong. See `shouldOfferReminder`.
   */
  reminderUrl: string | null;
  /**
   * A bare WhatsApp chat with nothing prefilled, for everyone who has a number.
   *
   * Built without consulting the parish's template, so there is nothing in it to
   * be wrong for — which is why this one is not filtered by status.
   */
  whatsappUrl: string | null;
};

export interface MemberDetails extends DashboardMember {
  administrativeNote: string | null;
  history: Array<{
    id: string;
    confessionDate: string;
    recordedAt: string;
  }>;
  dateFormat: "DD/MM/YYYY" | "D MMM YYYY";
  today: string;
}
