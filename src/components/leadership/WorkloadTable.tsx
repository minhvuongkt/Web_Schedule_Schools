import type { TeacherWorkloadDto } from "./api";

const DIFFERENCE_BADGE_CLASS: Record<string, string> = {
  THỪA: "bg-emerald-100 text-emerald-800",
  THIẾU: "bg-amber-100 text-amber-900",
  OK: "bg-zinc-200 text-zinc-600",
};

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

const TH_CLASS = "border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-500";
const TD_CLASS = "border border-zinc-200 px-3 py-2";

export function WorkloadTable({ workloads }: { workloads: TeacherWorkloadDto[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={`${TH_CLASS} text-left`}>
              Giáo viên
            </th>
            <th scope="col" className={`${TH_CLASS} text-left`}>
              Vị trí
            </th>
            <th scope="col" className={`${TH_CLASS} text-right`}>
              Dự kiến
            </th>
            <th scope="col" className={`${TH_CLASS} text-right`}>
              Đã xếp
            </th>
            <th scope="col" className={`${TH_CLASS} text-right`}>
              Chênh lệch
            </th>
            <th scope="col" className={`${TH_CLASS} text-right`}>
              Kiêm nhiệm
            </th>
            <th scope="col" className={`${TH_CLASS} text-right`}>
              Hạn mức
            </th>
          </tr>
        </thead>
        <tbody>
          {workloads.map((workload) => (
            <tr key={workload.teacherId} className="bg-white">
              <td className={TD_CLASS}>
                <span className="block font-medium text-zinc-900">
                  {workload.fullName}
                </span>
                <span className="block text-xs text-zinc-500">
                  {workload.teacherCode}
                </span>
              </td>
              <td className={`${TD_CLASS} text-zinc-600`}>
                {workload.position ?? "—"}
              </td>
              <td className={`${TD_CLASS} text-right tabular-nums text-zinc-900`}>
                {workload.expectedTeaching}
              </td>
              <td className={`${TD_CLASS} text-right tabular-nums text-zinc-900`}>
                {workload.scheduled}
              </td>
              <td className={`${TD_CLASS} text-right`}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="tabular-nums font-medium text-zinc-900">
                    {signed(workload.difference)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      DIFFERENCE_BADGE_CLASS[workload.status] ?? DIFFERENCE_BADGE_CLASS.OK
                    }`}
                  >
                    {workload.status}
                  </span>
                </span>
              </td>
              <td className={`${TD_CLASS} text-right tabular-nums text-zinc-600`}>
                {workload.dutyLessons}
              </td>
              <td className={`${TD_CLASS} text-right tabular-nums text-zinc-600`}>
                {workload.quota ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
