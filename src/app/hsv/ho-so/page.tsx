import { listClasses } from "@/server/services/timetable-read.service";
import { getActiveSchoolName } from "@/server/services/teacher-view.service";
import { StudentProfileClient } from "./student-profile-client";

export const dynamic = "force-dynamic";

export default async function StudentProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ lop?: string }>;
}) {
  const { lop } = await searchParams;
  const [classes, schoolName] = await Promise.all([
    listClasses(),
    getActiveSchoolName(),
  ]);
  let urlClass: string | undefined;
  if (lop) {
    const upper = lop.trim().toUpperCase();
    urlClass = classes.some((c) => c.code === upper) ? upper : undefined;
  }
  const selected = urlClass
    ? classes.find((c) => c.code === urlClass)
    : undefined;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4">
      <StudentProfileClient
        classes={classes.map((c) => ({ code: c.code, grade: c.grade }))}
        initialClass={urlClass ?? null}
        classInfo={
          selected
            ? {
                code: selected.code,
                grade: selected.grade,
                homeroomTeacherName: selected.homeroomTeacherName,
              }
            : null
        }
        schoolName={schoolName}
      />
    </main>
  );
}
