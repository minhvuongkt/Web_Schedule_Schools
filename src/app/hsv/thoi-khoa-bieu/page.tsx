import { listClasses } from "@/server/services/timetable-read.service";
import { getStudentTodayView } from "@/server/services/student-view.service";
import { StudentWeekClient } from "./student-week-client";

export const dynamic = "force-dynamic";

export default async function StudentTimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ lop?: string }>;
}) {
  const { lop } = await searchParams;
  const classes = await listClasses();
  let urlClass: string | undefined;
  if (lop) {
    const upper = lop.trim().toUpperCase();
    urlClass = classes.some((c) => c.code === upper) ? upper : undefined;
  }
  const view = urlClass ? await getStudentTodayView(urlClass) : null;

  return (
    <StudentWeekClient
      classes={classes.map((c) => ({ code: c.code, grade: c.grade }))}
      initialClass={urlClass ?? null}
      view={
        view
          ? {
              classInfo: view.classInfo,
              week: view.week,
              days: view.days,
            }
          : null
      }
    />
  );
}
