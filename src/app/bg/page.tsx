import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  apiErrorToMessage,
  apiFetch,
  type VersionListResponse,
  type WeeksResponse,
  type WorkloadsResponse,
} from "@/components/leadership/api";
import { ErrorBanner } from "@/components/leadership/ErrorBanner";
import { VersionList } from "@/components/leadership/VersionList";
import { WeekSelector } from "@/components/leadership/WeekSelector";
import { WorkloadTable } from "@/components/leadership/WorkloadTable";
import { AppShell } from "@/components/site/app-shell";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/domain/roles";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ weekId?: string | string[] }>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LeadershipDashboardPage({
  searchParams,
}: PageProps) {
  const user = await requireUser("/bg");
  if (!can(user.role, "workload:read-all")) {
    redirect("/khong-co-quyen?ly-do=sai-vai-tro");
  }

  const params = await searchParams;
  const requestedWeekId = firstParam(params.weekId);
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();

  let weeksError: string | null = null;
  let weeks: WeeksResponse["weeks"] = [];
  try {
    weeks = (await apiFetch<WeeksResponse>("/api/weeks", { cookie })).weeks;
  } catch (error) {
    weeksError = apiErrorToMessage(error, "/bg");
  }

  const selectedWeek =
    weeks.find((week) => week.id === requestedWeekId) ??
    weeks.find((week) => week.status === "ACTIVE") ??
    weeks[0] ??
    null;

  const [workloadsResult, versionsResult] = await Promise.allSettled([
    selectedWeek
      ? apiFetch<WorkloadsResponse>(
          `/api/workloads?weekId=${encodeURIComponent(selectedWeek.id)}`,
          { cookie },
        )
      : Promise.resolve(null),
    selectedWeek
      ? apiFetch<VersionListResponse>(
          `/api/timetable/versions?weekId=${encodeURIComponent(selectedWeek.id)}`,
          { cookie },
        )
      : Promise.resolve(null),
  ]);

  const workloads =
    workloadsResult.status === "fulfilled" ? workloadsResult.value : null;
  const workloadsError =
    workloadsResult.status === "rejected"
      ? apiErrorToMessage(workloadsResult.reason, "/bg")
      : null;
  const versions =
    versionsResult.status === "fulfilled" ? versionsResult.value : null;
  const versionsError =
    versionsResult.status === "rejected"
      ? apiErrorToMessage(versionsResult.reason, "/bg")
      : null;

  const canApprove = can(user.role, "timetable:approve");
  const canPublish = can(user.role, "timetable:publish");

  return (
    <AppShell page="Ban giám hiệu" user={user}>
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Ban giám hiệu
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Tổng quan tải trọng giáo viên và quy trình thời khóa biểu toàn trường.
          </p>
        </header>

        {weeksError ? (
          <ErrorBanner message={weeksError} />
        ) : weeks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
            Chưa có tuần học nào trong hệ thống.
          </p>
        ) : (
          <>
            <WeekSelector weeks={weeks} selectedWeekId={selectedWeek?.id ?? null} />

            <section aria-labelledby="tai-trong-heading" className="mb-8">
              <h2
                id="tai-trong-heading"
                className="mb-3 text-base font-semibold text-zinc-900"
              >
                Tải trọng giáo viên
              </h2>
              {workloadsError ? (
                <ErrorBanner message={workloadsError} />
              ) : workloads && workloads.workloads.length > 0 ? (
                <WorkloadTable workloads={workloads.workloads} />
              ) : (
                <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
                  Chưa có dữ liệu tải trọng cho tuần này.
                </p>
              )}
            </section>

            <section aria-labelledby="phien-ban-heading">
              <h2
                id="phien-ban-heading"
                className="mb-3 text-base font-semibold text-zinc-900"
              >
                Phiên bản thời khóa biểu
              </h2>
              {versionsError ? (
                <ErrorBanner message={versionsError} />
              ) : versions && versions.versions.length > 0 ? (
                <VersionList
                  versions={versions.versions}
                  canApprove={canApprove}
                  canPublish={canPublish}
                />
              ) : (
                <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
                  Tuần này chưa có phiên bản thời khóa biểu nào.
                </p>
              )}
            </section>
          </>
        )}

        <div className="mt-8 flex flex-wrap gap-3 border-t border-zinc-200 pt-4 text-sm">
          <Link
            href="/tkb"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
          >
            Thời khóa biểu đã công bố
          </Link>
          <Link
            href="/gv"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
          >
            Lịch dạy của tôi
          </Link>
          <Link
            href="/bg/phan-cong"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
          >
            Phân công giảng dạy
          </Link>
          <Link
            href="/admin/audit"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
          >
            Nhật ký thao tác
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
