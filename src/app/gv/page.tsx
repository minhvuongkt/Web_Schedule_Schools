import { notFound } from "next/navigation";

import { formatWeekRange } from "@/components/timetable/format";
import { TeacherDayList } from "@/components/teacher/TeacherDayList";
import { TeacherWeekTable } from "@/components/teacher/TeacherWeekTable";
import { WorkloadSummary } from "@/components/teacher/WorkloadSummary";
import { AppShell } from "@/components/site/app-shell";
import { requireTeacher } from "@/server/auth/session";
import {
  getTeacherTimetable,
  getTeacherWorkload,
} from "@/server/services/teacher-view.service";

export const dynamic = "force-dynamic";

export default async function TeacherTimetablePage() {
  const user = await requireTeacher();
  const [timetable, workload] = await Promise.all([
    getTeacherTimetable(user.teacherId),
    getTeacherWorkload(user.teacherId),
  ]);
  if (!timetable) {
    notFound();
  }

  const { teacher, week, days } = timetable;
  const teacherLine = [teacher.code, teacher.position, teacher.departmentName]
    .filter((part) => part !== null && part.trim() !== "")
    .join(" · ");

  return (
    <AppShell page="Lịch dạy của tôi" user={user}>
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Lịch dạy của tôi
          </h1>
          {week ? (
            <p className="mt-1 text-sm text-zinc-600">
              {`Tuần ${String(week.weekNo).padStart(2, "0")} · ${formatWeekRange(week.weekStart, week.weekEnd)}`}{" "}
              · Năm học {week.schoolYearName}
            </p>
          ) : null}
          <p className="mt-0.5 text-sm text-zinc-500">{teacherLine}</p>
        </header>

        {week ? (
          <>
            {workload ? (
              <div className="mb-6">
                <WorkloadSummary
                  expectedTeaching={workload.expectedTeaching}
                  scheduled={workload.scheduled}
                  difference={workload.difference}
                  dutyLessons={workload.dutyLessons}
                />
              </div>
            ) : null}

            {days.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
                Tuần này bạn chưa có tiết học nào.
              </p>
            ) : (
              <>
                <TeacherDayList days={days} />
                <TeacherWeekTable days={days} />
              </>
            )}

            <p className="mt-6 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
              Thời khóa biểu chỉ hiển thị phiên bản đã được công bố.
            </p>
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
            Tuần này chưa có thời khóa biểu được công bố.
          </p>
        )}
      </div>
    </AppShell>
  );
}
