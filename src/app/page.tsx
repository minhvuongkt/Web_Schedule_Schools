import type { Metadata } from "next";
import Link from "next/link";

import { formatWeekLabel } from "@/components/timetable/format";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon";
import { getCurrentUser } from "@/server/auth/session";
import type { Role } from "@/server/domain/roles";
import { getLandingData, type LandingPeek } from "@/server/services/landing.service";
import type { DayDto } from "@/server/services/timetable-read.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description:
    "Hệ thống thời khóa biểu điện tử Trường PTDTBT TH & THCS Măng Cành — xem lịch học theo tuần, thông báo thay giáo, dạy bù và quản lý thời khóa biểu toàn trường.",
};

/**
 * School identity: warm paper background ("giấy vở"), education green, and
 * the Vietnamese student-notebook motif — the "ô ly" square grid and the red
 * margin line every pupil knows from their exercise books.
 */
const PAPER = "#FAF7EF";

const NOTEBOOK_GRID = {
  backgroundImage:
    "linear-gradient(to right, rgba(22,101,52,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(22,101,52,0.055) 1px, transparent 1px)",
  backgroundSize: "26px 26px",
};

const SUBJECT_COLORS = [
  "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  "bg-orange-50 text-orange-800 ring-1 ring-orange-200",
  "bg-teal-50 text-teal-800 ring-1 ring-teal-200",
  "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
  "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
  "bg-lime-50 text-lime-800 ring-1 ring-lime-200",
  "bg-violet-50 text-violet-800 ring-1 ring-violet-200",
];

function subjectColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

function morningOf(day: DayDto) {
  return (
    day.sessions.find((s) => s.labelVi.toLowerCase().includes("sáng")) ??
    day.sessions[0] ??
    null
  );
}

const WORKSPACE_BY_ROLE: Partial<Record<Role, { href: string; label: string }>> = {
  TEACHER: { href: "/gv", label: "Lịch dạy của tôi" },
  PRINCIPAL: { href: "/bg", label: "Bảng điều khiển" },
  SUPER_ADMIN: { href: "/admin", label: "Soạn thời khóa biểu" },
  TIMETABLE_ADMIN: { href: "/admin", label: "Soạn thời khóa biểu" },
  STUDENT: { href: "/hsv", label: "Sổ tay học sinh" },
  PARENT: { href: "/hsv", label: "Sổ tay học sinh" },
};

function dayShortLabel(day: DayDto): string {
  return day.dayOfWeek === 7 ? "CN" : `T${day.dayOfWeek + 1}`;
}

/**
 * Timetable preview styled as a torn page from a Vietnamese student
 * notebook: ô ly grid, red margin line, washi tape, slight tilt.
 */
function PeekCard({ peek, weekLabel }: { peek: LandingPeek | null; weekLabel: string | null }) {
  if (!peek) {
    return (
      <div className="relative animate-scale-in [animation-delay:120ms]">
        <div className="absolute inset-0 rotate-2 rounded-2xl bg-white/70 shadow-md ring-1 ring-black/5" aria-hidden="true" />
        <div className="relative flex h-full min-h-80 flex-col items-center justify-center gap-4 rounded-2xl bg-white p-10 text-center shadow-xl ring-1 ring-black/5">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Icon name="calendar" size={30} />
          </span>
          <div>
            <p className="text-lg font-semibold text-stone-900">Thời khóa biểu tuần này</p>
            <p className="mt-1 text-sm text-stone-500">
              Sẽ hiển thị tại đây ngay khi nhà trường công bố.
            </p>
          </div>
          <Link
            href="/tkb"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
          >
            Xem tất cả các lớp
          </Link>
        </div>
      </div>
    );
  }

  const dayColumns = peek.days;
  const maxPeriods = Math.max(
    ...dayColumns.map((d) => morningOf(d)?.periods.length ?? 0),
    1,
  );

  return (
    <div className="relative animate-scale-in [animation-delay:120ms]">
      {/* back page for depth */}
      <div className="absolute inset-0 rotate-2 rounded-2xl bg-white/70 shadow-md ring-1 ring-black/5" aria-hidden="true" />
      <div className="relative -rotate-1 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
        {/* washi tape */}
        <span
          className="absolute -top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 -rotate-2 rounded-sm bg-amber-200/80 shadow-sm"
          aria-hidden="true"
        />
        {/* red notebook margin line */}
        <span
          className="pointer-events-none absolute bottom-0 left-3.5 top-0 w-px bg-red-300/70"
          aria-hidden="true"
        />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-100 px-5 py-4 pl-7">
          <span className="text-lg font-semibold tracking-tight text-stone-900">
            Lớp {peek.classCode}
          </span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
            Đã công bố
          </span>
          <span className="ml-auto text-xs font-medium text-stone-400">{weekLabel}</span>
        </div>

        <div className="overflow-x-auto px-5 py-4 pl-7" style={NOTEBOOK_GRID}>
          <table className="w-full border-separate border-spacing-1 text-center">
            <thead>
              <tr>
                <th className="w-8" />
                {dayColumns.map((day) => (
                  <th
                    key={day.date}
                    className={`rounded-md px-1 py-1.5 text-[11px] font-semibold ${
                      day.isToday
                        ? "bg-emerald-700 text-white"
                        : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    <span className="block">{dayShortLabel(day)}</span>
                    <span
                      className={`block text-[10px] font-normal ${
                        day.isToday ? "text-emerald-100" : "text-stone-400"
                      }`}
                    >
                      {day.date.slice(8, 10)}/{day.date.slice(5, 7)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxPeriods }, (_, periodIndex) => (
                <tr key={periodIndex}>
                  <th
                    scope="row"
                    className="text-[11px] font-medium tabular-nums text-stone-400"
                  >
                    {periodIndex + 1}
                  </th>
                  {dayColumns.map((day) => {
                    const lesson = morningOf(day)?.periods[periodIndex]?.lesson ?? null;
                    return (
                      <td key={day.date} className="p-0">
                        {lesson ? (
                          <span
                            className={`block min-h-11 rounded-md px-1 py-1 text-[10px] font-medium leading-tight ${subjectColor(lesson.subjectName)}`}
                          >
                            {lesson.subjectName}
                          </span>
                        ) : (
                          <span className="flex min-h-11 items-center justify-center rounded-md border border-dashed border-stone-200 text-stone-300">
                            ·
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 bg-amber-50/50 px-5 py-3 pl-7">
          <span className="truncate text-xs text-stone-500">
            {peek.homeroomTeacherName ? `GVCN: ${peek.homeroomTeacherName}` : "Buổi sáng"}
          </span>
          <Link
            href={`/tkb/${peek.classCode}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
          >
            Xem đầy đủ
            <Icon name="arrow-right" size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

interface RoleCardProps {
  icon: IconName;
  bubbleClass: string;
  linkClass: string;
  title: string;
  badge: string;
  badgeClass: string;
  bullets: string[];
  href: string;
  cta: string;
  delay?: number;
}

function RoleCard({
  icon,
  bubbleClass,
  linkClass,
  title,
  badge,
  badgeClass,
  bullets,
  href,
  cta,
  delay,
}: RoleCardProps) {
  return (
    <div
      className="flex animate-fade-up flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-900/5 transition duration-200 hover:-translate-y-1 hover:shadow-xl"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${bubbleClass}`}>
          <Icon name={icon} size={22} />
        </span>
        <div>
          <h3 className="text-base font-semibold text-stone-900">{title}</h3>
          <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
            {badge}
          </span>
        </div>
      </div>
      <ul className="mt-4 flex-1 space-y-2">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2 text-sm leading-snug text-stone-600">
            <Icon name="check" size={15} className="mt-0.5 shrink-0 text-emerald-600" />
            {bullet}
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`mt-5 inline-flex items-center gap-1.5 text-sm font-semibold ${linkClass}`}
      >
        {cta}
        <Icon name="arrow-right" size={16} />
      </Link>
    </div>
  );
}

interface FeatureProps {
  icon: IconName;
  bubbleClass: string;
  title: string;
  text: string;
  delay?: number;
}

function Feature({ icon, bubbleClass, title, text, delay }: FeatureProps) {
  return (
    <div
      className="flex animate-fade-up gap-4"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bubbleClass}`}>
        <Icon name={icon} size={20} />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">{text}</p>
      </div>
    </div>
  );
}

export default async function LandingPage() {
  const [data, user] = await Promise.all([
    getLandingData(),
    getCurrentUser().catch(() => null),
  ]);

  const { context, stats, peek } = data;
  const weekLabel = context
    ? formatWeekLabel(context.weekNo, context.weekStart, context.weekEnd)
    : null;
  const workspace = user ? WORKSPACE_BY_ROLE[user.role] : undefined;

  return (
    <div className="flex flex-1 flex-col" style={{ backgroundColor: PAPER }}>
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#FAF7EF]/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-stone-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">
              <Icon name="graduation-cap" size={18} />
            </span>
            <span className="hidden sm:block">Thời khóa biểu Măng Cành</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link
              href="/tkb"
              className="rounded-lg px-2.5 py-2 font-medium text-stone-600 transition duration-200 hover:bg-stone-900/5 hover:text-stone-900 sm:px-3"
            >
              Thời khóa biểu
            </Link>
            <Link
              href="/hsv"
              className="hidden rounded-lg px-3 py-2 font-medium text-stone-600 transition duration-200 hover:bg-stone-900/5 hover:text-stone-900 sm:block"
            >
              Sổ tay học sinh
            </Link>
            {user && workspace ? (
              <Link
                href={workspace.href}
                className="ml-1 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-[0.98]"
              >
                <Icon name="user" size={16} />
                {workspace.label}
              </Link>
            ) : (
              <Link
                href="/dang-nhap"
                className="ml-1 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-[0.98]"
              >
                <Icon name="login" size={16} />
                Đăng nhập
              </Link>
            )}
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" style={NOTEBOOK_GRID} aria-hidden="true" />
        <div
          className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-emerald-200/50 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-amber-200/60 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pb-28 pt-16 sm:pt-20 lg:grid-cols-2 lg:pb-32 lg:pt-24 2xl:max-w-7xl">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-800 shadow-sm ring-1 ring-emerald-200">
              <Icon name="calendar" size={14} />
              {context
                ? `Năm học ${context.schoolYearName} · ${weekLabel}`
                : "Năm học 2026–2027"}
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-stone-900 sm:text-5xl lg:text-6xl">
              Thời khóa biểu điện tử
            </h1>
            <p className="mt-3 text-lg font-medium text-emerald-800 sm:text-xl">
              Trường PTDTBT TH và THCS Măng Cành
            </p>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-stone-600">
              Xem lịch học theo tuần của từng lớp, nhận thông báo thay giáo, dạy bù
              và quản lý thời khóa biểu toàn trường — mọi thứ trong một nơi.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/tkb"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-xl active:translate-y-0 active:scale-[0.98]"
              >
                Xem thời khóa biểu
                <Icon name="arrow-right" size={16} />
              </Link>
              <Link
                href="/hsv"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-stone-800 ring-1 ring-stone-300 transition duration-200 hover:-translate-y-0.5 hover:ring-emerald-500 active:translate-y-0 active:scale-[0.98]"
              >
                <Icon name="graduation-cap" size={16} />
                Sổ tay học sinh
              </Link>
            </div>
            <p className="mt-6 text-sm text-stone-500">
              {user && workspace ? (
                <>
                  Xin chào, <span className="font-medium text-stone-900">{user.displayName}</span> —{" "}
                  <Link href={workspace.href} className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-900 hover:decoration-emerald-500">
                    vào không gian làm việc của bạn
                  </Link>
                  .
                </>
              ) : (
                <>
                  Giáo viên và cán bộ quản lý:{" "}
                  <Link
                    href="/dang-nhap"
                    className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-900 hover:decoration-emerald-500"
                  >
                    đăng nhập tại đây
                  </Link>
                  .
                </>
              )}
            </p>
          </div>

          <PeekCard peek={peek} weekLabel={weekLabel} />
        </div>
      </section>

      {stats ? (
        <section className="relative z-10 mx-auto -mt-14 w-full max-w-6xl px-4 2xl:max-w-7xl">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-6 rounded-2xl bg-white p-6 shadow-xl ring-1 ring-stone-900/5 sm:grid-cols-4 sm:p-8">
            <div className="flex animate-fade-up items-center gap-3.5" style={{ animationDelay: "80ms" }}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Icon name="users-2" size={20} />
              </span>
              <div>
                <dd className="text-2xl font-bold tabular-nums tracking-tight text-stone-900">
                  {stats.classCount}
                </dd>
                <dt className="text-xs font-medium text-stone-500">Lớp học</dt>
              </div>
            </div>
            <div className="flex animate-fade-up items-center gap-3.5" style={{ animationDelay: "160ms" }}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <Icon name="user" size={20} />
              </span>
              <div>
                <dd className="text-2xl font-bold tabular-nums tracking-tight text-stone-900">
                  {stats.teacherCount}
                </dd>
                <dt className="text-xs font-medium text-stone-500">Giáo viên</dt>
              </div>
            </div>
            <div className="flex animate-fade-up items-center gap-3.5" style={{ animationDelay: "240ms" }}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
                <Icon name="book-open" size={20} />
              </span>
              <div>
                <dd className="text-2xl font-bold tabular-nums tracking-tight text-stone-900">
                  {stats.subjectCount}
                </dd>
                <dt className="text-xs font-medium text-stone-500">Môn học</dt>
              </div>
            </div>
            <div className="flex animate-fade-up items-center gap-3.5" style={{ animationDelay: "320ms" }}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Icon name="clock" size={20} />
              </span>
              <div>
                <dd className="text-2xl font-bold tabular-nums tracking-tight text-stone-900">
                  {stats.entryCount}
                </dd>
                <dt className="text-xs font-medium text-stone-500">
                  Tiết học trong tuần{weekLabel ? ` · ${weekLabel.split(" · ")[0]}` : ""}
                </dt>
              </div>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="py-20">
        <div className="mx-auto w-full max-w-6xl px-4 2xl:max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
              Không gian làm việc
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">
              Truy cập theo vai trò
            </h2>
            <p className="mt-3 text-base leading-relaxed text-stone-600">
              Mỗi vai trò có lối đi riêng: học sinh và phụ huynh xem trực tiếp
              không cần tài khoản; giáo viên và cán bộ đăng nhập để vào phần
              việc của mình.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <RoleCard
              icon="graduation-cap"
              bubbleClass="bg-emerald-100 text-emerald-800"
              linkClass="text-emerald-700 hover:text-emerald-900"
              title="Học sinh và phụ huynh"
              badge="Không cần đăng nhập"
              badgeClass="bg-emerald-50 text-emerald-700"
              bullets={[
                "Thời khóa biểu cả tuần của tất cả các lớp (T2–T7)",
                "Sổ tay học sinh: tiết học kế tiếp, thông báo của lớp",
                "Tra cứu nhanh theo lớp, môn học hoặc giáo viên",
              ]}
              href="/hsv"
              cta="Mở sổ tay học sinh"
              delay={0}
            />
            <RoleCard
              icon="book-open"
              bubbleClass="bg-amber-100 text-amber-800"
              linkClass="text-amber-700 hover:text-amber-900"
              title="Giáo viên"
              badge="Cần đăng nhập"
              badgeClass="bg-stone-100 text-stone-600"
              bullets={[
                "Lịch dạy cá nhân theo tuần, bao gồm dạy thay và dạy bù",
                "Thông báo tức thì khi được xếp dạy thay",
                "Xuất lịch dạy của mình ra file in",
              ]}
              href="/dang-nhap?next=%2Fgv"
              cta="Đăng nhập để xem lịch dạy"
              delay={80}
            />
            <RoleCard
              icon="chart-column"
              bubbleClass="bg-teal-100 text-teal-800"
              linkClass="text-teal-700 hover:text-teal-900"
              title="Ban giám hiệu"
              badge="Cần đăng nhập"
              badgeClass="bg-stone-100 text-stone-600"
              bullets={[
                "Tổng quan khối lượng giáo dục toàn trường",
                "Phê duyệt và công bố thời khóa biểu từng tuần",
                "Quản lý phân công giáo dục theo từng giáo viên",
              ]}
              href="/dang-nhap?next=%2Fbg"
              cta="Đăng nhập vào bảng điều khiển"
              delay={160}
            />
            <RoleCard
              icon="settings"
              bubbleClass="bg-rose-100 text-rose-700"
              linkClass="text-rose-700 hover:text-rose-900"
              title="Quản trị viên"
              badge="Cần đăng nhập"
              badgeClass="bg-stone-100 text-stone-600"
              bullets={[
                "Soạn thời khóa biểu kéo-thả, kiểm tra xung đột tự động",
                "Nhập và xuất Excel, in ấn, chia sẻ qua mã QR",
                "Điều phối thay giáo, dạy bù và xem nhật ký hệ thống",
              ]}
              href="/dang-nhap?next=%2Fadmin"
              cta="Đăng nhập vào trình soạn"
              delay={240}
            />
          </div>
        </div>
      </section>

      <section className="bg-white py-20 ring-1 ring-stone-900/5">
        <div className="mx-auto w-full max-w-6xl px-4 2xl:max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
              Vì sao dùng hệ thống này
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">
              Tính năng nổi bật
            </h2>
          </div>

          <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon="shield-check"
              bubbleClass="bg-emerald-50 text-emerald-700"
              title="Công bố minh bạch"
              text="Trang công khai chỉ hiển thị phiên bản thời khóa biểu đã được nhà trường công bố chính thức — không bao giờ hiển thị bản nháp."
              delay={0}
            />
            <Feature
              icon="refresh-cw"
              bubbleClass="bg-amber-50 text-amber-700"
              title="Thay giáo và dạy bù"
              text="Điều phối dạy thay, hủy tiết và dạy bù ngay trên phiên bản đã công bố. Học sinh thấy ngay giáo viên mới, giáo viên được thông báo tự động."
              delay={70}
            />
            <Feature
              icon="bell"
              bubbleClass="bg-orange-50 text-orange-700"
              title="Thông báo tức thì"
              text="Đổi lịch, dạy thay, dạy bù được đẩy về giáo viên và lớp học theo thời gian thực — không cần tải lại trang."
              delay={140}
            />
            <Feature
              icon="file-spreadsheet"
              bubbleClass="bg-teal-50 text-teal-700"
              title="Excel và in ấn"
              text="Nhập thời khóa biểu từ file Excel giữ nguyên cấu trúc gốc, xuất theo 5 phạm vi và tạo bản in sạch sẽ cho lớp, giáo viên, phòng."
              delay={210}
            />
            <Feature
              icon="search"
              bubbleClass="bg-sky-50 text-sky-700"
              title="Tìm kiếm thông minh"
              text="Tra cứu theo lớp, môn học, giáo viên với kết quả chi tiết tiết học — gõ không dấu vẫn tìm đúng (gõ “toan” ra “Toán”)."
              delay={280}
            />
            <Feature
              icon="smartphone"
              bubbleClass="bg-rose-50 text-rose-700"
              title="Hoạt động offline"
              text="Cài lên màn hình chính như một ứng dụng (PWA) và vẫn xem được thời khóa biểu đã tải khi đường truyền yếu hoặc mất mạng."
              delay={350}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-20 2xl:max-w-7xl">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-700 to-emerald-900 px-6 py-12 text-center text-white shadow-lg shadow-emerald-900/20 sm:px-12">
          <div className="pointer-events-none absolute inset-0" style={NOTEBOOK_GRID} aria-hidden="true" />
          <div className="relative">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Lịch học tuần này đã sẵn sàng
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-emerald-100">
              {weekLabel
                ? `${weekLabel} — chọn lớp của bạn và xem chi tiết từng tiết học, giờ học và giáo viên đứng lớp.`
                : "Chọn lớp của bạn và xem chi tiết từng tiết học, giờ học và giáo viên đứng lớp."}
            </p>
            <Link
              href="/tkb"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-emerald-900 shadow-lg transition hover:bg-emerald-50 active:scale-[0.98]"
            >
              <Icon name="calendar" size={16} />
              Mở thời khóa biểu
            </Link>
          </div>
        </div>
      </section>

      <footer className="mt-auto bg-emerald-950 text-emerald-100/80">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2.5 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white">
                <Icon name="graduation-cap" size={18} />
              </span>
              <span className="font-semibold tracking-tight">
                Thời khóa biểu Măng Cành
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed">
              Hệ thống thời khóa biểu điện tử của Trường PTDTBT TH và THCS
              Măng Cành, năm học 2026–2027.
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-200/60">
              <Icon name="shield-check" size={14} />
              Trang công khai chỉ hiển thị phiên bản đã công bố
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Học sinh và phụ huynh</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/tkb" className="transition hover:text-white">
                  Thời khóa biểu theo lớp
                </Link>
              </li>
              <li>
                <Link href="/hsv" className="transition hover:text-white">
                  Sổ tay học sinh
                </Link>
              </li>
              <li>
                <Link href="/hsv/thong-bao" className="transition hover:text-white">
                  Thông báo lớp học
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Giáo viên và cán bộ</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/dang-nhap" className="transition hover:text-white">
                  Đăng nhập
                </Link>
              </li>
              <li>
                <Link href="/gv" className="transition hover:text-white">
                  Lịch dạy giáo viên
                </Link>
              </li>
              <li>
                <Link href="/bg" className="transition hover:text-white">
                  Ban giám hiệu
                </Link>
              </li>
              <li>
                <Link href="/admin" className="transition hover:text-white">
                  Trình soạn thời khóa biểu
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-emerald-200/60">
            <span>© 2026–2027 Trường PTDTBT TH và THCS Măng Cành</span>
            <span>Sắp xếp theo tuần · Sáng, Chiều · Thứ hai đến Thứ bảy</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
