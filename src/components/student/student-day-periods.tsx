import type { StudentPeriod } from "@/server/services/student-view.service";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * Student-facing day period list, grouped into morning/afternoon sessions so
 * the two halves never read as one continuous run of periods (morning ends
 * 11:05, afternoon starts 13:00). The service sorts periods by session
 * orderNo then period orderNo, so consecutive runs by label are the groups.
 *
 * Shared by the student home "today" list and the week view's selected day.
 */

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  SUBSTITUTED: { label: "Đổi GV", cls: "bg-amber-100 text-amber-900" },
  CANCELLED: { label: "Đã hủy", cls: "bg-zinc-200 text-zinc-600" },
  MAKEUP: { label: "Dạy bù", cls: "bg-blue-100 text-blue-800" },
  MOVED: { label: "Đã dời", cls: "bg-zinc-100 text-zinc-600" },
};

interface SessionGroup {
  key: string;
  label: string;
  periods: StudentPeriod[];
  timeRange: string;
}

function groupBySession(periods: StudentPeriod[]): SessionGroup[] {
  const groups: SessionGroup[] = [];
  for (const period of periods) {
    const current = groups[groups.length - 1];
    if (current && current.label === period.sessionLabelVi) {
      current.periods.push(period);
    } else {
      groups.push({
        key: `${period.sessionLabelVi}-${groups.length}`,
        label: period.sessionLabelVi,
        periods: [period],
        timeRange: "",
      });
    }
  }
  for (const group of groups) {
    const first = group.periods[0];
    const last = group.periods[group.periods.length - 1];
    group.timeRange =
      first.startTime + (last.endTime ? ` – ${last.endTime}` : "");
  }
  return groups;
}

/** Session accent: morning = sunrise/amber, afternoon = sunset/sky. */
function sessionMeta(label: string): { icon: IconName; badge: string } {
  const normalized = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("sang")) {
    return {
      icon: "sunrise",
      badge: "bg-amber-50 text-amber-800 ring-amber-200",
    };
  }
  if (normalized.includes("chieu")) {
    return {
      icon: "sunset",
      badge: "bg-sky-50 text-sky-800 ring-sky-200",
    };
  }
  return {
    icon: "clock",
    badge: "bg-zinc-50 text-zinc-700 ring-zinc-200",
  };
}

export function StudentDayPeriods({ periods }: { periods: StudentPeriod[] }) {
  const groups = groupBySession(periods);
  return (
    <div>
      {groups.map((group, groupIndex) => {
        const meta = sessionMeta(group.label);
        return (
          <section
            key={group.key}
            aria-label={group.label}
            className={groupIndex > 0 ? "mt-6" : undefined}
          >
            <div
              className={`mb-2 flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ${meta.badge}`}
            >
              <Icon name={meta.icon} size={15} />
              <span className="text-xs font-semibold uppercase tracking-wide">
                {group.label}
              </span>
              <span className="ml-auto text-[11px] font-medium tabular-nums">
                {group.periods.length} tiết · {group.timeRange}
              </span>
            </div>
            <ul className="space-y-1.5">
              {group.periods.map((p) => {
                const badge = p.lesson ? STATUS_BADGE[p.lesson.status] : undefined;
                return (
                  <li
                    key={`${group.key}-${p.orderNo}`}
                    className={`flex items-baseline gap-3 rounded-lg border px-3 py-2.5 ${
                      p.lesson?.status === "CANCELLED"
                        ? "border-zinc-100 bg-zinc-50 opacity-60"
                        : "border-zinc-200 bg-white"
                    }`}
                  >
                    <span className="w-16 shrink-0 text-xs tabular-nums text-zinc-500">
                      Tiết {p.orderNo}
                      <span className="block">{p.startTime}</span>
                    </span>
                    {p.lesson ? (
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-zinc-900">
                          {p.lesson.subjectName}
                          {p.lesson.componentName ? ` (${p.lesson.componentName})` : ""}
                          {badge ? (
                            <span
                              className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-xs text-zinc-500">
                          {p.lesson.teacherName}
                          {p.lesson.roomCode ? ` · Phòng ${p.lesson.roomCode}` : ""}
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm text-zinc-400">—</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
