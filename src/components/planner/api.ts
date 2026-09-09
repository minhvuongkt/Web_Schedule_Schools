"use client";

/** Typed client for the planner API contract. */

export interface WeekSummary {
  id: string;
  weekNo: number;
  weekStart: string;
  weekEnd: string;
  status: string;
  hasPublished: boolean;
}

export interface VersionSummary {
  id: string;
  weekId: string;
  versionNo: number;
  status: "DRAFT" | "REVIEW" | "APPROVED" | "PUBLISHED" | "ARCHIVED";
  revision: number;
  name: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  entryCount: number;
}

export interface ClassRef {
  id: string;
  code: string;
  grade: number;
}

export interface TeacherRef {
  id: string;
  code: string;
  fullName: string;
  shortName: string;
  position: string | null;
}

export interface SubjectRef {
  id: string;
  code: string;
  name: string;
  components: { id: string; code: string; name: string }[];
}

export interface RoomRef {
  id: string;
  code: string;
  name: string | null;
  capacity: number | null;
}

export interface GridDay {
  id: string;
  date: string;
  dayOfWeek: number;
  isSchoolDay: boolean;
}

export interface GridSession {
  id: string;
  code: string;
  labelVi: string;
  orderNo: number;
}

export interface GridPeriod {
  id: string;
  sessionId: string;
  orderNo: number;
  startTime: string;
  endTime: string | null;
}

export interface GridEntry {
  id: string;
  academicDayId: string;
  periodId: string;
  classId: string;
  subjectId: string;
  subjectComponentId: string | null;
  teacherId: string;
  roomId: string | null;
  status: string;
  notes: string | null;
}

export interface VersionGrid {
  version: {
    id: string;
    weekId: string;
    weekNo: number;
    versionNo: number;
    status: VersionSummary["status"];
    revision: number;
  };
  days: GridDay[];
  sessions: GridSession[];
  periods: GridPeriod[];
  entries: GridEntry[];
}

export interface IssueItem {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export interface ValidateReport {
  errors: IssueItem[];
  warnings: IssueItem[];
  workloadIssues: IssueItem[];
  counts: { errors: number; warnings: number };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = {};
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }).error;
    throw new ApiError(
      res.status,
      err?.code ?? "UNKNOWN",
      err?.message ?? `Lỗi ${res.status}`,
      err?.details ?? {},
    );
  }
  return body as T;
}

export const api = {
  weeks: () => request<{ weeks: WeekSummary[] }>("/api/weeks"),
  classes: () => request<{ classes: ClassRef[] }>("/api/classes"),
  teachers: () => request<{ teachers: TeacherRef[] }>("/api/teachers"),
  subjects: () => request<{ subjects: SubjectRef[] }>("/api/subjects"),
  rooms: () => request<{ rooms: RoomRef[] }>("/api/rooms"),
  versions: (weekId: string) =>
    request<{ versions: VersionSummary[] }>(`/api/timetable/versions?weekId=${weekId}`),
  versionGrid: (versionId: string) =>
    request<VersionGrid>(`/api/timetable/versions/${versionId}`),
  createVersion: (weekId: string, copyFromVersionId?: string) =>
    request<{ version: { id: string; versionNo: number; status: string; revision: number } }>(
      "/api/timetable/versions",
      {
        method: "POST",
        body: JSON.stringify({ weekId, copyFromVersionId }),
      },
    ),
  validate: (versionId: string) =>
    request<ValidateReport>(`/api/timetable/versions/${versionId}/validate`, { method: "POST" }),
  submitReview: (versionId: string) =>
    request<{ version: VersionSummary }>(`/api/timetable/versions/${versionId}/submit-review`, {
      method: "POST",
    }),
  approve: (versionId: string) =>
    request<{ version: VersionSummary }>(`/api/timetable/versions/${versionId}/approve`, {
      method: "POST",
    }),
  publish: (versionId: string) =>
    request<{ version: VersionSummary }>(`/api/timetable/versions/${versionId}/publish`, {
      method: "POST",
    }),
  createEntry: (body: Record<string, unknown>) =>
    request<{ entry: GridEntry; revision: number }>("/api/timetable/entries", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateEntry: (id: string, body: Record<string, unknown>) =>
    request<{ entry: GridEntry; revision: number }>(`/api/timetable/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteEntry: (id: string, expectedRevision: number) =>
    request<{ ok: boolean; revision: number }>(
      `/api/timetable/entries/${id}?expectedRevision=${expectedRevision}`,
      { method: "DELETE" },
    ),
};
