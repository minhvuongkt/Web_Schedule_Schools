import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { diacriticFreeKey } from "@/server/domain/normalize";
/**
 * GET /api/search?q=… — global search (spec §21): classes, teachers,
 * subjects (public-friendly result shape; no teacher workload internals).
 * Diacritics-insensitive: "toan" matches "Toán", "nguyen thi" matches
 * "Nguyễn Thị". Authenticated users may search teachers by full name; the
 * public site only needs class/subject results (teacher search links to the
 * login-protected teacher view anyway, so returning them for any session
 * user is safe — no internal data is exposed).
 */
const MAX_RESULTS = 8;
export async function GET(request: Request): Promise<NextResponse> {
  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const q = raw.trim();
  if (q.length < 2) {
    return NextResponse.json({ classes: [], teachers: [], subjects: [] });
  }
  const key = diacriticFreeKey(q);
  const [classes, teachers, subjects] = await Promise.all([
    prisma.class.findMany({
      where: { schoolYear: { status: "ACTIVE" } },
      select: { code: true, grade: true, homeroomTeacher: { select: { fullName: true } } },
    }),
    prisma.teacher.findMany({
      where: { isActive: true },
      select: { id: true, code: true, fullName: true, position: true },
    }),
    prisma.subject.findMany({
      select: {
        code: true,
        name: true,
        components: { select: { code: true, name: true } },
      },
    }),
  ]);
  const classResults = classes
    .filter((c) => diacriticFreeKey(c.code).includes(key))
    .slice(0, MAX_RESULTS)
    .map((c) => ({
      type: "class" as const,
      code: c.code,
      grade: c.grade,
      title: `Lớp ${c.code}`,
      subtitle: `Khối ${c.grade}${c.homeroomTeacher ? ` · GVCN ${c.homeroomTeacher.fullName}` : ""}`,
      href: `/tkb/${c.code}`,
    }));
  const teacherResults = teachers
    .filter(
      (t) =>
        diacriticFreeKey(t.fullName).includes(key) ||
        diacriticFreeKey(t.code).includes(key),
    )
    .slice(0, MAX_RESULTS)
    .map((t) => ({
      type: "teacher" as const,
      id: t.id,
      code: t.code,
      fullName: t.fullName,
      title: t.fullName,
      subtitle: `${t.code}${t.position ? ` · ${t.position}` : ""}`,
      href: null, // teacher personal view requires login
    }));
  const subjectResults = subjects
    .filter(
      (s) =>
        diacriticFreeKey(s.name).includes(key) ||
        diacriticFreeKey(s.code).includes(key),
    )
    .slice(0, MAX_RESULTS)
    .map((s) => ({
      type: "subject" as const,
      code: s.code,
      title: s.name,
      subtitle: s.components.length > 0 ? s.components.map((c) => c.name).join(", ") : "Môn học",
      href: `/tkb?subject=${encodeURIComponent(s.code)}`,
    }));
  return NextResponse.json({
    classes: classResults,
    teachers: teacherResults,
    subjects: subjectResults,
  });
}
