import type { Metadata } from "next";
import Link from "next/link";

import { formatWeekLabel } from "@/components/timetable/format";
import { Icon } from "@/components/ui/icon";
import { UiLink } from "@/components/ui/link";
import { PublicFooter, PublicHeader } from "@/components/site/public-chrome";
import {
  getActiveWeekContext,
  listClasses,
} from "@/server/services/timetable-read.service";
import {
  globalSearch,
  type SearchHit,
  type SearchLesson,
} from "@/server/services/search.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Thời khóa biểu — chọn lớp",
};

const GRADE_COLORS: Record<number, string> = {
  1: "from-sky-500 to-blue-600",
  2: "from-emerald-500 to-teal-600",
  3: "from-violet-500 to-purple-600",
  4: "from-rose-500 to-pink-600",
  5: "from-amber-500 to-orange-600",
  6: "from-blue-500 to-indigo-600",
  7: "from-cyan-500 to-sky-600",
  8: "from-teal-500 to-emerald-600",
  9: "from-indigo-500 to-violet-600",
};

const HIT_TYPE_META: Record<SearchHit["type"], { label: string; badge: string }> = {
  class: { label: "Lớp", badge: "bg-blue-100 text-blue-800" },
  subject: { label: "Môn học", badge: "bg-emerald-100 text-emerald-800" },
  teacher: { label: "Giáo viên", badge: "bg-amber-100 text-amber-900" },
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  SUBSTITUTED: { label: "Đổi GV", cls: "bg-amber-100 text-amber-900" },
  MAKEUP: { label: "Dạy bù", cls: "bg-blue-100 text-blue-800" },
  MOVED: { label: "Đã dời", cls: "bg-zinc-100 text-zinc-600" },
};

function LessonTable({ lessons }: { lessons: SearchLesson[] }) {
  if (lessons.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-zinc-400">
        Chưa có tiết nào trong tuần được công bố.
      </p>
    );
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-zinc-100 text-left text-zinc-400">
          <th className="px-3 py-1.5 font-medium">Thứ · Ngày</th>
          <th className="px-3 py-1.5 font-medium">Tiết</th>
          <th className="px-3 py-1.5 font-medium">Thời gian</th>
          <th className="px-3 py-1.5 font-medium">Lớp</th>
          <th className="px-3 py-1.5 font-medium">Môn</th>
          <th className="px-3 py-1.5 font-medium">Giáo viên</th>
        </tr>
      </thead>
      <tbody>
        {lessons.map((lesson, i) => {
          const badge = STATUS_BADGE[lesson.status];
          return (
            <tr key={i} className="border-b border-zinc-50 last:border-0">
              <td className="px-3 py-1.5 whitespace-nowrap text-zinc-700">
                {lesson.dayLabelVi}
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600">
                {lesson.sessionLabelVi} · Tiết {lesson.periodOrderNo}
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap tabular-nums text-zinc-600">
                {lesson.startTime}
                {lesson.endTime ? `–${lesson.endTime}` : ""}
              </td>
              <td className="px-3 py-1.5 font-medium text-zinc-900">
                {lesson.className}
              </td>
              <td className="px-3 py-1.5 text-zinc-700">
                {lesson.subjectName}
                {lesson.componentName ? ` (${lesson.componentName})` : ""}
                {badge ? (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-1.5 text-zinc-700">{lesson.teacherName}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default async function TimetableClassSelectorPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [context, classes, search] = await Promise.all([
    getActiveWeekContext(),
    listClasses(),
    globalSearch(q ?? ""),
  ]);
  const hasQuery = search.query.length >= 2;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-gradient-to-b from-emerald-50/60 via-white to-[#FAF7EF]">
      <PublicHeader current="tkb" />
      <main className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Thời khóa biểu
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {context.schoolName} · Năm học {context.schoolYearName} ·{" "}
            {formatWeekLabel(context.weekNo, context.weekStart, context.weekEnd)}
          </p>

          <form action="/tkb" method="get" className="mt-4 flex max-w-md gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                <Icon name="search" size={18} />
              </span>
              <input
                type="search"
                name="q"
                defaultValue={search.query}
                placeholder="Tìm lớp, môn học, giáo viên… (vd: 8A, toan, Nguyen Thi)"
                aria-label="Tìm kiếm"
                className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-10 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-500"
            >
              Tìm
            </button>
          </form>
        </header>

        {hasQuery ? (
          <section aria-label="Kết quả tìm kiếm" className="space-y-4">
            <p className="text-sm text-zinc-500">
              {search.hits.length > 0
                ? `${search.hits.length} kết quả cho “${search.query}”${search.week ? ` · Tuần ${String(search.week.weekNo).padStart(2, "0")} (${search.week.weekStart.slice(8, 10)}/${search.week.weekStart.slice(5, 7)} – ${search.week.weekEnd.slice(8, 10)}/${search.week.weekEnd.slice(5, 7)})` : ""}:`
                : `Không tìm thấy kết quả cho “${search.query}”.`}
            </p>

            {search.hits.map((hit) => {
              const meta = HIT_TYPE_META[hit.type];
              return (
                <article
                  key={`${hit.type}-${hit.key}`}
                  className="rounded-lg border border-zinc-200 bg-white"
                >
                  <header className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}
                    >
                      {meta.label}
                    </span>
                    <h2 className="text-sm font-semibold text-zinc-900">
                      {hit.title}
                    </h2>
                    <span className="text-xs text-zinc-500">{hit.subtitle}</span>
                    <span className="ml-auto text-xs text-zinc-400">
                      {hit.lessonCount !== undefined && hit.lessonCount > 0
                        ? `${Math.min(hit.lessons?.length ?? 0, hit.lessonCount)}/${hit.lessonCount} tiết`
                        : ""}
                    </span>
                    {hit.href ? (
                      <Link
                        href={hit.href}
                        className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-500"
                      >
                        Xem thời khóa biểu
                        <Icon name="chevron-right" size={14} />
                      </Link>
                    ) : hit.type === "teacher" ? (
                      <Link
                        href="/dang-nhap"
                        className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-500"
                        title="Xem lịch dạy (cần đăng nhập)"
                      >
                        Lịch dạy (cần đăng nhập)
                        <Icon name="login" size={14} />
                      </Link>
                    ) : null}
                  </header>
                  <LessonTable lessons={hit.lessons ?? []} />
                  {hit.lessonCount !== undefined &&
                    (hit.lessons?.length ?? 0) < hit.lessonCount && (
                      <footer className="border-t border-zinc-100 px-3 py-1.5 text-[11px] text-zinc-400">
                        Hiển thị {hit.lessons?.length} tiết đầu — xem đầy đủ qua
                        liên kết phía trên.
                      </footer>
                    )}
                </article>
              );
            })}

            <p className="no-print text-xs text-zinc-400">
              <UiLink variant="muted" href="/tkb" className="text-xs">
                ← Xem tất cả các lớp
              </UiLink>
            </p>
          </section>
        ) : (
          <>
            {classes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
                Chưa có lớp nào trong năm học hiện tại.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                {classes.map((cls) => (
                  <li key={cls.id}>
                    <Link
                      href={`/tkb/${cls.code}`}
                      className="group relative block overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg active:translate-y-0 active:scale-[0.97]"
                    >
                      <span
                        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${
                          GRADE_COLORS[cls.grade] ?? "from-blue-500 to-indigo-600"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="text-xl font-bold tracking-tight text-zinc-900">
                        {cls.code}
                      </span>
                      <span className="mt-1 block text-sm text-zinc-600">
                        Khối {cls.grade}
                      </span>
                      {cls.homeroomTeacherName ? (
                        <span className="mt-0.5 block truncate text-xs text-zinc-500">
                          GVCN: {cls.homeroomTeacherName}
                        </span>
                      ) : null}
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 opacity-0 transition group-hover:opacity-100">
                        Xem thời khóa biểu
                        <Icon name="chevron-right" size={12} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <p className="no-print mt-8 text-xs text-zinc-500">
          Thời khóa biểu chỉ hiển thị phiên bản đã được công bố.
        </p>
      </div>
      </main>
      <PublicFooter />
    </div>
  );
}
