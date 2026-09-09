import { subjectTone } from "@/components/timetable/format";
import type {
  WorkloadClassCountDto,
  WorkloadSubjectCountDto,
} from "@/server/services/teacher-view.service";

interface WorkloadBreakdownProps {
  classesTaught: WorkloadClassCountDto[];
  subjectsTaught: WorkloadSubjectCountDto[];
}

/**
 * Per-class and per-subject lesson breakdown for the week — the DTOs the
 * workload service already computes (engine-derived counts, so they always
 * match the headline numbers).
 */
export function WorkloadBreakdown({
  classesTaught,
  subjectsTaught,
}: WorkloadBreakdownProps) {
  if (classesTaught.length === 0 && subjectsTaught.length === 0) return null;

  return (
    <section
      aria-label="Phân bổ tiết theo lớp và môn học"
      className="grid gap-3 md:grid-cols-2"
    >
      {classesTaught.length > 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Lớp đang dạy
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {classesTaught.map((item) => (
              <li
                key={item.classCode}
                className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1"
              >
                <span className="text-sm font-medium text-zinc-900">
                  {item.classCode}
                </span>
                <span className="text-xs text-zinc-500">
                  {item.lessons} tiết
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {subjectsTaught.length > 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Môn đang dạy
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {subjectsTaught.map((item) => (
              <li
                key={`${item.subjectName}#${item.componentName ?? ""}`}
                className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1"
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${subjectTone(item.subjectName).bar}`}
                />
                <span className="text-sm font-medium text-zinc-900">
                  {item.componentName
                    ? `${item.subjectName} (${item.componentName})`
                    : item.subjectName}
                </span>
                <span className="text-xs text-zinc-500">
                  {item.lessons} tiết
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
