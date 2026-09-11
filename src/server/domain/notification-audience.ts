import type { Role } from "@/server/domain/roles";

/**
 * Broadcast audiences for admin announcements (pure). A "student" audience
 * also writes a public class announcement per active class because the
 * student handbook (/hsv) is class-based and login-free.
 */

export const AUDIENCES = ["TEACHERS", "STUDENTS", "ALL", "SELECTED"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS_VI: Record<Audience, string> = {
  TEACHERS: "Giáo viên & ban giám hiệu",
  STUDENTS: "Học sinh & phụ huynh",
  ALL: "Tất cả mọi người",
  SELECTED: "Người nhận được chọn",
};

/**
 * Account roles that can be picked as individual recipients. Admin roles are
 * excluded — they have no notification inbox.
 */
export const SELECTABLE_ROLES = [
  "TEACHER",
  "PRINCIPAL",
  "STUDENT",
  "PARENT",
] as const satisfies readonly Role[];

export interface AudienceTargets {
  /** Account roles that receive an in-app notification (+ Web Push). */
  roles: readonly Role[];
  /** Also write a public class announcement for every active class. */
  classAnnouncement: boolean;
}

export function isAudience(value: string): value is Audience {
  return (AUDIENCES as readonly string[]).includes(value);
}

export function audienceTargets(audience: Audience): AudienceTargets {
  switch (audience) {
    case "TEACHERS":
      return { roles: ["TEACHER", "PRINCIPAL"], classAnnouncement: false };
    case "STUDENTS":
      return { roles: ["STUDENT", "PARENT"], classAnnouncement: true };
    case "ALL":
      return {
        roles: ["TEACHER", "PRINCIPAL", "STUDENT", "PARENT"],
        classAnnouncement: true,
      };
    case "SELECTED":
      // Recipients come from the explicit userIds list instead of roles.
      return { roles: [], classAnnouncement: false };
  }
}
