import type { MemberListItem } from "@/lib/member-domain";

export type DashboardMember = MemberListItem & {
  whatsappUrl: string | null;
};

export interface MemberDetails extends DashboardMember {
  administrativeNote: string | null;
  whatsappUrl: string | null;
  history: Array<{
    id: string;
    confessionDate: string;
    recordedAt: string;
  }>;
  dateFormat: "DD/MM/YYYY" | "D MMM YYYY";
  today: string;
}
