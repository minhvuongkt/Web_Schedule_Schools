import { headers } from "next/headers";
import { redirect } from "next/navigation";

export class ApiFetchError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = "ApiFetchError";
    this.status = status;
    this.code = code;
  }
}

export interface ApiFetchOptions {
  cookie?: string;
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

async function readErrorBody(
  response: Response,
): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return { code: body.error?.code, message: body.error?.message };
  } catch {
    return {};
  }
}

export async function apiFetch<TResponse>(
  path: string,
  { cookie }: ApiFetchOptions = {},
): Promise<TResponse> {
  const headerList = await headers();
  const host = headerList.get("host");
  if (!host) {
    throw new ApiFetchError(500, undefined, "Không xác định được origin của yêu cầu.");
  }
  const protocol =
    headerList.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  const response = await fetch(new URL(path, `${protocol}://${host}`), {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });
  if (response.redirected) {
    throw new ApiFetchError(
      401,
      "UNAUTHENTICATED",
      "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.",
    );
  }
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiFetchError(
      response.status,
      body.code,
      body.message ?? `Không tải được dữ liệu (HTTP ${response.status}).`,
    );
  }
  try {
    return (await response.json()) as TResponse;
  } catch {
    throw new ApiFetchError(
      response.status,
      undefined,
      "Dữ liệu trả về không đúng định dạng.",
    );
  }
}

export function apiErrorToMessage(error: unknown, returnTo: string): string {
  if (error instanceof ApiFetchError) {
    if (error.status === 401) {
      redirect(`/dang-nhap?next=${encodeURIComponent(returnTo)}`);
    }
    if (error.status === 403) {
      redirect("/khong-co-quyen?ly-do=sai-vai-tro");
    }
    return error.message;
  }
  return "Không tải được dữ liệu. Vui lòng thử lại sau.";
}

export interface WeekOptionDto {
  id: string;
  weekNo: number;
  weekStart: string;
  weekEnd: string;
  status: string;
  hasPublished: boolean;
}

export interface WeeksResponse {
  weeks: WeekOptionDto[];
}

export interface TeacherWorkloadDto {
  teacherId: string;
  teacherCode: string;
  fullName: string;
  position: string | null;
  expectedTeaching: number;
  dutyLessons: number;
  scheduled: number;
  difference: number;
  quota: number | null;
  status: "OK" | "THỪA" | "THIẾU";
}

export interface WorkloadsResponse {
  week: { weekNo: number; weekStart: string; weekEnd: string };
  workloads: TeacherWorkloadDto[];
}

export interface VersionDto {
  id: string;
  weekId: string;
  versionNo: number;
  status: string;
  revision: number;
  name: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  entryCount: number;
}

export interface VersionListResponse {
  versions: VersionDto[];
}

export interface AuditEntryDto {
  id: string;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AuditLogResponse {
  entries: AuditEntryDto[];
}
