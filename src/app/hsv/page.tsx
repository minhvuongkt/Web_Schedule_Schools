import { InstallPrompt } from "@/components/pwa/install-prompt";
import { UiLink } from "@/components/ui/link";
import { listClasses } from "@/server/services/timetable-read.service";
import {
  getStudentTodayView,
  vietnamNow,
  type StudentPeriod,
} from "@/server/services/student-view.service";
import { StudentHomeClient } from "./student-home-client";

export const dynamic = "force-dynamic";

const VI_DAY_FULL: Record<number, string> = {
  1: "Thứ hai",
  2: "Thứ ba",
  3: "Thứ tư",
  4: "Thứ năm",
  5: "Thứ sáu",
  6: "Thứ bảy",
  7: "Chủ nhật",
};

export default async function StudentHomePage({
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

  const { date } = vietnamNow();
  const view = urlClass ? await getStudentTodayView(urlClass) : null;
  const todayLabel = date
    ? `${VI_DAY_FULL[new Date(`${date}T00:00:00Z`).getUTCDay() || 7]}, ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
    : "";

  if (!view) {
    // No class selected yet — show a picker-first shell.
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900">Sổ tay học sinh</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Chọn lớp của bạn để xem thời khóa biểu hôm nay.
          </p>
        </header>
        <StudentHomeClient
          classes={classes.map((c) => ({ code: c.code, grade: c.grade }))}
          initialClass={null}
          todayLabel={todayLabel}
          view={null}
        />
        <div className="mt-6 flex justify-center">
          <InstallPrompt compact />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4">
      <StudentHomeClient
        classes={classes.map((c) => ({ code: c.code, grade: c.grade }))}
        initialClass={urlClass ?? null}
        todayLabel={todayLabel}
        view={{
          classInfo: view.classInfo,
          week: view.week,
          today: view.today,
          nextLesson: view.nextLesson,
          days: view.days,
        }}
      />
      <p className="mt-6 text-center text-xs text-zinc-400">
        <UiLink variant="muted" href="/tkb" className="text-xs">
          Xem thời khóa biểu đầy đủ theo lớp
        </UiLink>
      </p>
      <div className="mt-4 flex justify-center pb-2">
        <InstallPrompt compact />
      </div>
    </main>
  );
}

export type { StudentPeriod };
