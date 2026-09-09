import type { TeacherLessonDto } from "@/server/services/teacher-view.service";

/** "Toán · 8A" / "KHTN (Lý) · 8A" — own schedule always shows the class. */
export function formatLessonClass(lesson: TeacherLessonDto): string {
  const subject = lesson.componentName
    ? `${lesson.subjectName} (${lesson.componentName})`
    : lesson.subjectName;
  return `${subject} · ${lesson.className}`;
}

// CANCELLED slots render dimmed: the lesson no longer takes place.
export function lessonTextClass(status: string): string {
  return status === "CANCELLED" ? "text-zinc-400" : "";
}

export function LessonStatusBadge({
  status,
  substitutingFor,
}: {
  status: string;
  substitutingFor?: string | null;
}) {
  if (substitutingFor) {
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
        Dạy thay{substitutingFor ? ` cho ${substitutingFor}` : ""}
      </span>
    );
  }
  if (status === "SUBSTITUTED") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
        Được thay thế
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600">
        Đã hủy
      </span>
    );
  }
  return null;
}
