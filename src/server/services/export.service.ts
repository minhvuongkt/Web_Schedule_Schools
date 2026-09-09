/**
 * Timetable exports: school-friendly Excel workbooks (SheetJS) and
 * print-optimized HTML for browser print-to-PDF.
 *
 * Scopes: school (one sheet per day), class, teacher (personal grids),
 * workload ("Tải trọng") and assignments ("Phân công"). All timetable data
 * comes from the week's PUBLISHED version (highest versionNo) — public
 * pages and exports can never render drafts. weekId defaults to the active
 * week; a week without a published version fails with NO_PUBLISHED_VERSION.
 *
 * Phase-1 PDF strategy (no headless renderer dependency allowed on this
 * machine): /api/timetable/export/pdf returns the same data as clean
 * print-CSS HTML; the browser's "In / Lưu PDF" (window.print()) produces
 * the PDF. Every export writes an EXPORT AuditLog row.
 *
 * Auth: "export:excel" (TIMETABLE_ADMIN / PRINCIPAL / SUPER_ADMIN per the
 * RBAC matrix). Note: TEACHER's "export:pdf" permission is intentionally
 * unused here — teacher self-print is served by the public /tkb pages.
 */
import * as XLSX from "xlsx";
import { prisma } from "@/server/db";
import { assertPermission, type Role } from "@/server/domain/roles";
import type { SessionUser } from "@/server/services/auth.service";
import { dateToIso, resolveActiveWeek, todayIso } from "@/server/services/school-calendar";

export type ExportScope = "school" | "class" | "teacher" | "workload" | "assignments";
export const EXPORT_SCOPES: readonly ExportScope[] = [
  "school",
  "class",
  "teacher",
  "workload",
  "assignments",
];

export class ExportError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const pad2 = (value: number): string => String(value).padStart(2, "0");

function dayLabelOf(dayOfWeek: number): string {
  return dayOfWeek === 7 ? "Chủ nhật" : `Thứ ${dayOfWeek + 1}`;
}

function weekRangeLabel(startIso: string, endIso: string): string {
  const [y1, m1, d1] = startIso.split("-");
  const [y2, m2, d2] = endIso.split("-");
  return y1 === y2 ? `${d1}/${m1}–${d2}/${m2}/${y2}` : `${d1}/${m1}/${y1}–${d2}/${m2}/${y2}`;
}

function dateLabelVi(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

function stampLabelVi(date: Date | null): string {
  if (!date) return "—";
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  })
    .format(date)
    .split("-");
  return `${day}/${month}/${year}`;
}

function exportStampVi(date: Date): string {
  const time = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${stampLabelVi(date)} ${time}`;
}

function sheetSafeName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Sheet";
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

interface ExportEntry {
  academicDayId: string;
  periodId: string;
  status: string;
  classId: string;
  classCode: string;
  teacherId: string;
  teacherName: string;
  subjectName: string;
  subjectComponentName: string | null;
}

interface ExportDay {
  id: string;
  dateIso: string;
  dayOfWeek: number;
  isSchoolDay: boolean;
}

interface ExportContext {
  scope: ExportScope;
  schoolName: string;
  schoolYearName: string;
  weekId: string;
  weekNo: number;
  weekStart: string;
  weekEnd: string;
  versionId: string;
  versionNo: number;
  publishedAt: Date | null;
  days: ExportDay[]; // ordered by date
  sessions: { code: string; labelVi: string; orderNo: number }[];
  slotOfPeriod: Map<string, { sessionCode: string; orderNo: number }>;
  classes: { id: string; code: string; grade: number }[];
  entries: ExportEntry[];
  focusClassCode: string | null;
  focusTeacherName: string | null;
}

const ENTRY_SELECT = {
  academicDayId: true,
  periodId: true,
  status: true,
  classId: true,
  teacherId: true,
  class: { select: { code: true } },
  teacher: { select: { fullName: true } },
  subject: { select: { name: true } },
  subjectComponent: { select: { name: true } },
} as const;

async function loadExportContext(params: {
  scope: ExportScope;
  weekId?: string;
  classId?: string;
  teacherId?: string;
}): Promise<ExportContext> {
  let week = null as
    | {
        id: string;
        weekNo: number;
        startDate: Date;
        endDate: Date;
        schoolYearId: string | null;
        semester: { schoolYearId: string } | null;
      }
    | null;

  if (params.weekId) {
    week = await prisma.week.findUnique({
      where: { id: params.weekId },
      select: {
        id: true,
        weekNo: true,
        startDate: true,
        endDate: true,
        schoolYearId: true,
        semester: { select: { schoolYearId: true } },
      },
    });
    if (!week) {
      throw new ExportError("WEEK_NOT_FOUND", "Không tìm thấy tuần học.", { weekId: params.weekId }, 404);
    }
  } else {
    const activeYear = await prisma.schoolYear.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ startDate: "desc" }, { name: "desc" }],
      select: { id: true },
    });
    if (!activeYear) {
      throw new ExportError("NO_ACTIVE_SCHOOL_YEAR", "Không có năm học đang hoạt động.", {}, 400);
    }
    const active = await resolveActiveWeek(activeYear.id, todayIso());
    if (!active) {
      throw new ExportError("NO_ACTIVE_WEEK", "Không xác định được tuần hiện tại.", {}, 400);
    }
    week = await prisma.week.findUnique({
      where: { id: active.id },
      select: {
        id: true,
        weekNo: true,
        startDate: true,
        endDate: true,
        schoolYearId: true,
        semester: { select: { schoolYearId: true } },
      },
    });
    if (!week) {
      throw new ExportError("WEEK_NOT_FOUND", "Không tìm thấy tuần học.", { weekId: active.id }, 404);
    }
  }

  const schoolYearId = week.schoolYearId ?? week.semester?.schoolYearId;
  if (!schoolYearId) {
    throw new ExportError("NO_SCHOOL_YEAR", "Không xác định được năm học của tuần.", { weekId: week.id }, 400);
  }

  const version = await prisma.timetableVersion.findFirst({
    where: { weekId: week.id, status: "PUBLISHED" },
    orderBy: [{ versionNo: "desc" }, { id: "asc" }],
    select: { id: true, versionNo: true, publishedAt: true, createdAt: true },
  });
  if (!version) {
    throw new ExportError(
      "NO_PUBLISHED_VERSION",
      `Tuần ${week.weekNo} chưa có phiên bản thời khóa biểu đã công bố.`,
      { weekId: week.id },
      400,
    );
  }

  const [schoolYear, days, sessions, periods, classes, entries] = await Promise.all([
    prisma.schoolYear.findUnique({
      where: { id: schoolYearId },
      select: { name: true, school: { select: { name: true } } },
    }),
    prisma.academicDay.findMany({
      where: { weekId: week.id },
      select: { id: true, date: true, dayOfWeek: true, isSchoolDay: true },
      orderBy: { date: "asc" },
    }),
    prisma.sessionConfig.findMany({
      where: { schoolYearId },
      select: { code: true, labelVi: true, orderNo: true },
      orderBy: { orderNo: "asc" },
    }),
    prisma.period.findMany({
      where: { session: { schoolYearId } },
      select: { id: true, orderNo: true, session: { select: { code: true, orderNo: true } } },
    }),
    prisma.class.findMany({
      where: { schoolYearId },
      select: { id: true, code: true, grade: true },
      orderBy: [{ grade: "asc" }, { code: "asc" }],
    }),
    prisma.timetableEntry.findMany({
      where: { versionId: version.id, status: { not: "CANCELLED" } },
      select: ENTRY_SELECT,
    }),
  ]);

  let focusClassCode: string | null = null;
  if (params.scope === "class") {
    if (!params.classId) {
      throw new ExportError("VALIDATION_ERROR", "Xuất theo lớp cần tham số classId.", {}, 400);
    }
    const klass = classes.find((c) => c.id === params.classId);
    if (!klass) {
      throw new ExportError("CLASS_NOT_FOUND", "Không tìm thấy lớp trong năm học của tuần.", { classId: params.classId }, 404);
    }
    focusClassCode = klass.code;
  }

  let focusTeacherName: string | null = null;
  if (params.scope === "teacher") {
    if (!params.teacherId) {
      throw new ExportError("VALIDATION_ERROR", "Xuất theo giáo viên cần tham số teacherId.", {}, 400);
    }
    const teacher = await prisma.teacher.findUnique({
      where: { id: params.teacherId },
      select: { fullName: true },
    });
    if (!teacher) {
      throw new ExportError("TEACHER_NOT_FOUND", "Không tìm thấy giáo viên.", { teacherId: params.teacherId }, 404);
    }
    focusTeacherName = teacher.fullName;
  }

  return {
    scope: params.scope,
    schoolName: schoolYear?.school.name ?? "Trường học",
    schoolYearName: schoolYear?.name ?? "",
    weekId: week.id,
    weekNo: week.weekNo,
    weekStart: dateToIso(week.startDate),
    weekEnd: dateToIso(week.endDate),
    versionId: version.id,
    versionNo: version.versionNo,
    publishedAt: version.publishedAt ?? version.createdAt,
    days: days.map((day) => ({
      id: day.id,
      dateIso: dateToIso(day.date),
      dayOfWeek: day.dayOfWeek,
      isSchoolDay: day.isSchoolDay,
    })),
    sessions,
    slotOfPeriod: new Map(
      periods.map((period) => [
        period.id,
        { sessionCode: period.session.code, orderNo: period.orderNo },
      ]),
    ),
    classes,
    entries: entries.map((entry) => ({
      academicDayId: entry.academicDayId,
      periodId: entry.periodId,
      status: entry.status,
      classId: entry.classId,
      classCode: entry.class.code,
      teacherId: entry.teacherId,
      teacherName: entry.teacher.fullName,
      subjectName: entry.subject.name,
      subjectComponentName: entry.subjectComponent?.name ?? null,
    })),
    focusClassCode,
    focusTeacherName,
  };
}

// ---------------------------------------------------------------------------
// Grid pivots
// ---------------------------------------------------------------------------

interface SlotCell {
  subject: string; // display label ("Khoa học tự nhiên (Lý)")
  teacher: string;
  classCode: string;
}

function slotKey(sessionCode: string, orderNo: number): string {
  return `${sessionCode}#${orderNo}`;
}

function subjectDisplay(entry: ExportEntry): string {
  return entry.subjectComponentName
    ? `${entry.subjectName} (${entry.subjectComponentName})`
    : entry.subjectName;
}

/** dayId → (classId | teacherId) → slotKey → cell. */
function pivotByDay(
  ctx: ExportContext,
  keyOf: (entry: ExportEntry) => string,
): Map<string, Map<string, Map<string, SlotCell>>> {
  const byDay = new Map<string, Map<string, Map<string, SlotCell>>>();
  for (const entry of ctx.entries) {
    const slot = ctx.slotOfPeriod.get(entry.periodId);
    if (!slot) continue;
    const inner =
      byDay.get(entry.academicDayId) ?? new Map<string, Map<string, SlotCell>>();
    byDay.set(entry.academicDayId, inner);
    const slots = inner.get(keyOf(entry)) ?? new Map<string, SlotCell>();
    inner.set(keyOf(entry), slots);
    slots.set(slotKey(slot.sessionCode, slot.orderNo), {
      subject: subjectDisplay(entry),
      teacher: entry.teacherName,
      classCode: entry.classCode,
    });
  }
  return byDay;
}

function maxPeriodOfDay(
  byDay: Map<string, Map<string, Map<string, SlotCell>>>,
  dayId: string,
  sessionCode: string,
): number {
  let max = 0;
  for (const slots of byDay.get(dayId)?.values() ?? []) {
    for (const key of slots.keys()) {
      const [code, order] = key.split("#");
      if (code === sessionCode) max = Math.max(max, Number(order));
    }
  }
  return max;
}

function maxPeriodOfAll(
  byDay: Map<string, Map<string, Map<string, SlotCell>>>,
  rowKey: string,
  sessionCode: string,
): number {
  let max = 0;
  for (const inner of byDay.values()) {
    for (const key of inner.get(rowKey)?.keys() ?? []) {
      const [code, order] = key.split("#");
      if (code === sessionCode) max = Math.max(max, Number(order));
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// Common AOA blocks
// ---------------------------------------------------------------------------

function headerBlock(ctx: ExportContext, subtitle: string): string[][] {
  return [
    [ctx.schoolName],
    [subtitle],
    [`Đã công bố ngày ${stampLabelVi(ctx.publishedAt)}`],
    [],
  ];
}

function footerBlock(): string[][] {
  return [[], [`Xuất lúc ${exportStampVi(new Date())}`]];
}

// ---------------------------------------------------------------------------
// Workbook builders
// ---------------------------------------------------------------------------

function buildSchoolWorkbook(ctx: ExportContext): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const byDay = pivotByDay(ctx, (entry) => entry.classId);
  const title = `THỜI KHÓA BIỂU TUẦN ${pad2(ctx.weekNo)} (${weekRangeLabel(ctx.weekStart, ctx.weekEnd)})`;

  const sheetDays = ctx.days.filter(
    (day) => day.isSchoolDay || (byDay.get(day.id)?.size ?? 0) > 0,
  );
  const daysToRender =
    sheetDays.length > 0
      ? sheetDays
      : ctx.days.length > 0
        ? [ctx.days[0]!]
        : [];

  for (const day of daysToRender) {
    const rows: string[][] = [
      ...headerBlock(ctx, title),
      [`${dayLabelOf(day.dayOfWeek)} · ${dateLabelVi(day.dateIso)}/${day.dateIso.slice(0, 4)}`],
      [],
      ["Buổi", "Tiết", ...ctx.classes.map((klass) => klass.code)],
    ];
    for (const session of ctx.sessions) {
      const maxPeriod = maxPeriodOfDay(byDay, day.id, session.code);
      if (maxPeriod === 0) continue;
      for (let periodNo = 1; periodNo <= maxPeriod; periodNo++) {
        const key = slotKey(session.code, periodNo);
        const cells = ctx.classes.map((klass) => {
          const cell = byDay.get(day.id)?.get(klass.id)?.get(key);
          return cell ? `${cell.subject}\n${cell.teacher}` : "";
        });
        rows.push([periodNo === 1 ? session.labelVi : "", `Tiết ${periodNo}`, ...cells]);
      }
    }
    rows.push(...footerBlock());
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [{ wch: 8 }, { wch: 7 }, ...ctx.classes.map(() => ({ wch: 24 }))];
    XLSX.utils.book_append_sheet(workbook, sheet, sheetSafeName(dayLabelOf(day.dayOfWeek)));
  }
  return workbook;
}

function buildFocusGridWorkbook(
  ctx: ExportContext,
  rowKey: string,
  heading: string,
  sheetTitle: string,
  cellOf: (cell: SlotCell) => string,
): XLSX.WorkBook {
  const byDay = pivotByDay(ctx, (entry) =>
    ctx.scope === "class" ? entry.classId : entry.teacherId,
  );
  const columns = ctx.days.filter((day) => (byDay.get(day.id)?.get(rowKey)?.size ?? 0) > 0);
  const title = `THỜI KHÓA BIỂU TUẦN ${pad2(ctx.weekNo)} (${weekRangeLabel(ctx.weekStart, ctx.weekEnd)})`;

  const rows: string[][] = [
    ...headerBlock(ctx, title),
    [heading],
    [],
    ["Buổi", "Tiết", ...columns.map((day) => `${dayLabelOf(day.dayOfWeek)} (${dateLabelVi(day.dateIso)})`)],
  ];
  for (const session of ctx.sessions) {
    const maxPeriod = maxPeriodOfAll(byDay, rowKey, session.code);
    if (maxPeriod === 0) continue;
    for (let periodNo = 1; periodNo <= maxPeriod; periodNo++) {
      const key = slotKey(session.code, periodNo);
      const cells = columns.map(
        (day) => {
          const cell = byDay.get(day.id)?.get(rowKey)?.get(key);
          return cell ? cellOf(cell) : "";
        },
      );
      rows.push([periodNo === 1 ? session.labelVi : "", `Tiết ${periodNo}`, ...cells]);
    }
  }
  rows.push(...footerBlock());

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 8 }, { wch: 7 }, ...columns.map(() => ({ wch: 26 }))];
  XLSX.utils.book_append_sheet(workbook, sheet, sheetSafeName(sheetTitle));
  return workbook;
}

interface WorkloadRow {
  teacherName: string;
  position: string;
  expected: number;
  scheduled: number;
  difference: number;
  duties: string;
}

async function loadWorkloadRows(ctx: ExportContext): Promise<WorkloadRow[]> {
  const [teachers, assignments, scheduledCounts] = await Promise.all([
    prisma.teacher.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, position: true },
      orderBy: { code: "asc" },
    }),
    prisma.teachingAssignment.findMany({
      where: { isActive: true },
      select: {
        teacherId: true,
        lessonsPerWeek: true,
        assignmentType: true,
        notes: true,
      },
    }),
    prisma.timetableEntry.groupBy({
      by: ["teacherId"],
      where: { versionId: ctx.versionId, status: { not: "CANCELLED" } },
      _count: { _all: true },
    }),
  ]);
  const scheduled = new Map(scheduledCounts.map((row) => [row.teacherId, row._count._all]));
  const rows = new Map<string, WorkloadRow>();
  for (const teacher of teachers) {
    rows.set(teacher.id, {
      teacherName: teacher.fullName,
      position: teacher.position ?? "",
      expected: 0,
      scheduled: scheduled.get(teacher.id) ?? 0,
      difference: 0,
      duties: "",
    });
  }
  for (const assignment of assignments) {
    const row = rows.get(assignment.teacherId);
    if (!row) continue;
    if (assignment.assignmentType === "TEACHING") {
      row.expected += assignment.lessonsPerWeek;
    } else if (assignment.assignmentType === "DUTY") {
      const notes = assignment.notes ?? "Kiêm nhiệm";
      row.duties = row.duties === "" ? notes : `${row.duties}; ${notes}`;
      if (assignment.lessonsPerWeek > 0) {
        row.duties += ` (${assignment.lessonsPerWeek} tiết/tuần)`;
      }
    }
  }
  for (const row of rows.values()) {
    row.difference = row.scheduled - row.expected;
  }
  return [...rows.values()];
}

function buildWorkloadWorkbook(ctx: ExportContext, workloadRows: WorkloadRow[]): XLSX.WorkBook {
  const rows: string[][] = [
    ...headerBlock(
      ctx,
      `TẢI TRỌNG GIÁO VIÊN — TUẦN ${pad2(ctx.weekNo)} (${weekRangeLabel(ctx.weekStart, ctx.weekEnd)})`,
    ),
    ["STT", "Giáo viên", "Chức vụ", "Phân công (tiết/tuần)", "Đã xếp", "Chênh lệch", "Kiêm nhiệm"],
  ];
  let sumExpected = 0;
  let sumScheduled = 0;
  workloadRows.forEach((row, index) => {
    sumExpected += row.expected;
    sumScheduled += row.scheduled;
    rows.push([
      String(index + 1),
      row.teacherName,
      row.position,
      String(row.expected),
      String(row.scheduled),
      String(row.difference),
      row.duties,
    ]);
  });
  rows.push(["", "Tổng cộng", "", String(sumExpected), String(sumScheduled), String(sumScheduled - sumExpected), ""]);
  rows.push(...footerBlock());

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 5 },
    { wch: 26 },
    { wch: 18 },
    { wch: 12 },
    { wch: 9 },
    { wch: 11 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Tải trọng");
  return workbook;
}

async function buildAssignmentsWorkbook(ctx: ExportContext): Promise<XLSX.WorkBook> {
  const [teachers, classes, subjects, components, assignments] = await Promise.all([
    prisma.teacher.findMany({ select: { id: true, fullName: true }, orderBy: { code: "asc" } }),
    prisma.class.findMany({ select: { id: true, code: true } }),
    prisma.subject.findMany({ select: { id: true, name: true } }),
    prisma.subjectComponent.findMany({ select: { id: true, name: true } }),
    prisma.teachingAssignment.findMany({
      where: { isActive: true },
      select: {
        teacherId: true,
        classId: true,
        subjectId: true,
        subjectComponentId: true,
        lessonsPerWeek: true,
        assignmentType: true,
        notes: true,
      },
    }),
  ]);
  const teacherName = new Map(teachers.map((t) => [t.id, t.fullName]));
  const classCode = new Map(classes.map((c) => [c.id, c.code]));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const componentName = new Map(components.map((c) => [c.id, c.name]));

  const rows: string[][] = [
    ...headerBlock(ctx, `PHÂN CÔNG GIẢNG DẠY — NĂM HỌC ${ctx.schoolYearName}`),
    ["STT", "Giáo viên", "Loại", "Lớp", "Môn", "Số tiết/tuần", "Ghi chú"],
  ];
  const sorted = [...assignments].sort((a, b) => {
    const byTeacher = (teacherName.get(a.teacherId) ?? "").localeCompare(
      teacherName.get(b.teacherId) ?? "",
      "vi",
    );
    if (byTeacher !== 0) return byTeacher;
    return (a.classId ? classCode.get(a.classId) ?? "" : "").localeCompare(
      b.classId ? classCode.get(b.classId) ?? "" : "",
      "vi",
    );
  });
  sorted.forEach((assignment, index) => {
    const isTeaching = assignment.assignmentType === "TEACHING";
    const subject = assignment.subjectId
      ? subjectName.get(assignment.subjectId) ?? ""
      : "";
    const component = assignment.subjectComponentId
      ? componentName.get(assignment.subjectComponentId)
      : null;
    rows.push([
      String(index + 1),
      teacherName.get(assignment.teacherId) ?? assignment.teacherId,
      isTeaching ? "Dạy học" : "Kiêm nhiệm",
      assignment.classId ? classCode.get(assignment.classId) ?? "—" : "—",
      isTeaching ? (component ? `${subject} (${component})` : subject) : "—",
      String(assignment.lessonsPerWeek),
      assignment.notes ?? "",
    ]);
  });
  rows.push(...footerBlock());

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 5 },
    { wch: 26 },
    { wch: 12 },
    { wch: 8 },
    { wch: 30 },
    { wch: 13 },
    { wch: 42 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Phân công");
  return workbook;
}

// ---------------------------------------------------------------------------
// Public API: Excel
// ---------------------------------------------------------------------------

export interface ExportParams {
  scope: ExportScope;
  weekId?: string;
  classId?: string;
  teacherId?: string;
  actor: SessionUser;
}

export interface ExportFileResult {
  buffer: Buffer;
  fileName: string;
}

export async function exportTimetableExcel(params: ExportParams): Promise<ExportFileResult> {
  assertPermission(params.actor.role as Role, "export:excel");
  if (!EXPORT_SCOPES.includes(params.scope)) {
    throw new ExportError("VALIDATION_ERROR", `scope không hợp lệ: ${params.scope}`, {}, 400);
  }
  const ctx = await loadExportContext(params);

  let workbook: XLSX.WorkBook;
  if (params.scope === "school") {
    workbook = buildSchoolWorkbook(ctx);
  } else if (params.scope === "class") {
    workbook = buildFocusGridWorkbook(
      ctx,
      params.classId!,
      `LỚP ${ctx.focusClassCode}`,
      `Lớp ${ctx.focusClassCode}`,
      (cell) => `${cell.subject}\n${cell.teacher}`,
    );
  } else if (params.scope === "teacher") {
    workbook = buildFocusGridWorkbook(
      ctx,
      params.teacherId!,
      `LỊCH DẠY CỦA ${ctx.focusTeacherName}`,
      ctx.focusTeacherName ?? "Giáo viên",
      (cell) => `${cell.subject} · ${cell.classCode}`,
    );
  } else if (params.scope === "workload") {
    workbook = buildWorkloadWorkbook(ctx, await loadWorkloadRows(ctx));
  } else {
    workbook = await buildAssignmentsWorkbook(ctx);
  }

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const fileName = `tkb-tuan-${pad2(ctx.weekNo)}-${params.scope}.xlsx`;
  await writeExportAudit(params, ctx, fileName, "xlsx");
  return { buffer, fileName };
}

// ---------------------------------------------------------------------------
// Public API: print HTML (browser print-to-PDF — Phase-1 strategy)
// ---------------------------------------------------------------------------

export async function exportTimetablePrintHtml(params: ExportParams): Promise<{ html: string; fileName: string }> {
  assertPermission(params.actor.role as Role, "export:excel");
  if (!EXPORT_SCOPES.includes(params.scope)) {
    throw new ExportError("VALIDATION_ERROR", `scope không hợp lệ: ${params.scope}`, {}, 400);
  }
  const ctx = await loadExportContext(params);
  const title = `Thời khóa biểu tuần ${pad2(ctx.weekNo)} (${weekRangeLabel(ctx.weekStart, ctx.weekEnd)})`;
  const parts: string[] = [];

  if (params.scope === "school") {
    const byDay = pivotByDay(ctx, (entry) => entry.classId);
    for (const day of ctx.days) {
      if (!(day.isSchoolDay || (byDay.get(day.id)?.size ?? 0) > 0)) continue;
      parts.push(printDaySection(ctx, byDay, day));
    }
  } else if (params.scope === "class" || params.scope === "teacher") {
    const byDay = pivotByDay(ctx, (entry) =>
      params.scope === "class" ? entry.classId : entry.teacherId,
    );
    const rowKey = params.scope === "class" ? params.classId! : params.teacherId!;
    const heading =
      params.scope === "class" ? `Lớp ${ctx.focusClassCode}` : `Lịch dạy của ${ctx.focusTeacherName}`;
    parts.push(printFocusSection(ctx, byDay, rowKey, heading, params.scope));
  } else if (params.scope === "workload") {
    parts.push(printWorkloadSection(await loadWorkloadRows(ctx), ctx));
  } else {
    parts.push(await printAssignmentsSection(ctx));
  }

  const html = printDocument(ctx, title, parts.join("\n"));
  const fileName = `tkb-tuan-${pad2(ctx.weekNo)}-${params.scope}.html`;
  await writeExportAudit(params, ctx, fileName, "print");
  return { html, fileName };
}

// ---------------------------------------------------------------------------
// Print HTML fragments
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printDocument(ctx: ExportContext, title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ${escapeHtml(ctx.schoolName)}</title>
<style>
  body { font-family: "Times New Roman", Times, serif; color: #000; background: #fff; margin: 24px; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 4px; text-transform: uppercase; }
  h2 { font-size: 15px; text-align: center; margin: 0 0 2px; font-weight: normal; }
  .meta { text-align: center; font-size: 13px; margin-bottom: 12px; }
  section { margin-bottom: 22px; }
  section > h3 { font-size: 14px; margin: 0 0 6px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eee; font-weight: bold; }
  td.slot { white-space: pre-line; }
  td.num, th.num { text-align: center; }
  .toolbar { text-align: center; margin: 16px 0; }
  .toolbar button { font-size: 14px; padding: 8px 20px; cursor: pointer; }
  .footer { font-size: 11px; font-style: italic; margin-top: 8px; }
  @media print {
    .no-print { display: none !important; }
    body { margin: 0; color: #000 !important; background: #fff !important; }
    a { display: none !important; color: #000 !important; text-decoration: none !important; }
    section { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="toolbar no-print">
  <button type="button" onclick="window.print()">In / Lưu PDF</button>
</div>
<h1>${escapeHtml(ctx.schoolName)}</h1>
<h2>${escapeHtml(title)}</h2>
<p class="meta">Đã công bố ngày ${escapeHtml(stampLabelVi(ctx.publishedAt))}</p>
${body}
<p class="footer">Xuất lúc ${escapeHtml(exportStampVi(new Date()))}</p>
</body>
</html>`;
}

function printDaySection(
  ctx: ExportContext,
  byDay: Map<string, Map<string, Map<string, SlotCell>>>,
  day: ExportDay,
): string {
  const head = `<tr><th>Buổi</th><th>Tiết</th>${ctx.classes
    .map((klass) => `<th>${escapeHtml(klass.code)}</th>`)
    .join("")}</tr>`;
  const bodyRows: string[] = [];
  for (const session of ctx.sessions) {
    const maxPeriod = maxPeriodOfDay(byDay, day.id, session.code);
    for (let periodNo = 1; periodNo <= maxPeriod; periodNo++) {
      const key = slotKey(session.code, periodNo);
      const cells = ctx.classes
        .map((klass) => {
          const cell = byDay.get(day.id)?.get(klass.id)?.get(key);
          return cell
            ? `<td class="slot">${escapeHtml(cell.subject)}\n${escapeHtml(cell.teacher)}</td>`
            : "<td></td>";
        })
        .join("");
      bodyRows.push(
        `<tr><td>${periodNo === 1 ? escapeHtml(session.labelVi) : ""}</td><td class="num">${periodNo}</td>${cells}</tr>`,
      );
    }
  }
  return `<section>
<h3>${escapeHtml(dayLabelOf(day.dayOfWeek))} · ${escapeHtml(dateLabelVi(day.dateIso))}/${day.dateIso.slice(0, 4)}</h3>
<table>${head}${bodyRows.join("")}</table>
</section>`;
}

function printFocusSection(
  ctx: ExportContext,
  byDay: Map<string, Map<string, Map<string, SlotCell>>>,
  rowKey: string,
  heading: string,
  scope: "class" | "teacher",
): string {
  const columns = ctx.days.filter((day) => (byDay.get(day.id)?.get(rowKey)?.size ?? 0) > 0);
  const head = `<tr><th>Buổi</th><th>Tiết</th>${columns
    .map(
      (day) =>
        `<th>${escapeHtml(dayLabelOf(day.dayOfWeek))} (${escapeHtml(dateLabelVi(day.dateIso))})</th>`,
    )
    .join("")}</tr>`;
  const bodyRows: string[] = [];
  for (const session of ctx.sessions) {
    const maxPeriod = maxPeriodOfAll(byDay, rowKey, session.code);
    for (let periodNo = 1; periodNo <= maxPeriod; periodNo++) {
      const key = slotKey(session.code, periodNo);
      const cells = columns
        .map((day) => {
          const cell = byDay.get(day.id)?.get(rowKey)?.get(key);
          if (!cell) return "<td></td>";
          const text =
            scope === "class"
              ? `${cell.subject}\n${cell.teacher}`
              : `${cell.subject} · ${cell.classCode}`;
          return `<td class="slot">${escapeHtml(text)}</td>`;
        })
        .join("");
      bodyRows.push(
        `<tr><td>${periodNo === 1 ? escapeHtml(session.labelVi) : ""}</td><td class="num">${periodNo}</td>${cells}</tr>`,
      );
    }
  }
  return `<section>
<h3>${escapeHtml(heading)}</h3>
<table>${head}${bodyRows.join("")}</table>
</section>`;
}

function printWorkloadSection(rows: WorkloadRow[], ctx: ExportContext): string {
  const bodyRows = rows.map(
    (row) => `<tr><td>${escapeHtml(row.teacherName)}</td><td>${escapeHtml(row.position)}</td><td class="num">${row.expected}</td><td class="num">${row.scheduled}</td><td class="num">${row.difference}</td><td>${escapeHtml(row.duties)}</td></tr>`,
  );
  const sumExpected = rows.reduce((sum, row) => sum + row.expected, 0);
  const sumScheduled = rows.reduce((sum, row) => sum + row.scheduled, 0);
  bodyRows.push(
    `<tr><th>Tổng cộng</th><th></th><th class="num">${sumExpected}</th><th class="num">${sumScheduled}</th><th class="num">${sumScheduled - sumExpected}</th><th></th></tr>`,
  );
  return `<section>
<h3>Tải trọng giáo viên — tuần ${pad2(ctx.weekNo)}</h3>
<table><tr><th>Giáo viên</th><th>Chức vụ</th><th>Phân công</th><th>Đã xếp</th><th>Chênh lệch</th><th>Kiêm nhiệm</th></tr>${bodyRows.join("")}</table>
</section>`;
}

async function printAssignmentsSection(ctx: ExportContext): Promise<string> {
  const [teachers, classes, subjects, components, assignments] = await Promise.all([
    prisma.teacher.findMany({ select: { id: true, fullName: true }, orderBy: { code: "asc" } }),
    prisma.class.findMany({ select: { id: true, code: true } }),
    prisma.subject.findMany({ select: { id: true, name: true } }),
    prisma.subjectComponent.findMany({ select: { id: true, name: true } }),
    prisma.teachingAssignment.findMany({
      where: { isActive: true },
      select: {
        teacherId: true,
        classId: true,
        subjectId: true,
        subjectComponentId: true,
        lessonsPerWeek: true,
        assignmentType: true,
        notes: true,
      },
    }),
  ]);
  const teacherName = new Map(teachers.map((t) => [t.id, t.fullName]));
  const classCode = new Map(classes.map((c) => [c.id, c.code]));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const componentName = new Map(components.map((c) => [c.id, c.name]));

  const bodyRows = assignments.map((assignment) => {
    const isTeaching = assignment.assignmentType === "TEACHING";
    const subject = assignment.subjectId ? subjectName.get(assignment.subjectId) ?? "" : "";
    const component = assignment.subjectComponentId
      ? componentName.get(assignment.subjectComponentId)
      : null;
    return `<tr><td>${escapeHtml(teacherName.get(assignment.teacherId) ?? "")}</td><td>${isTeaching ? "Dạy học" : "Kiêm nhiệm"}</td><td>${escapeHtml(assignment.classId ? classCode.get(assignment.classId) ?? "—" : "—")}</td><td>${escapeHtml(isTeaching ? (component ? `${subject} (${component})` : subject) : "—")}</td><td class="num">${assignment.lessonsPerWeek}</td><td>${escapeHtml(assignment.notes ?? "")}</td></tr>`;
  });
  return `<section>
<h3>Phân công giảng dạy — năm học ${escapeHtml(ctx.schoolYearName)}</h3>
<table><tr><th>Giáo viên</th><th>Loại</th><th>Lớp</th><th>Môn</th><th>Số tiết/tuần</th><th>Ghi chú</th></tr>${bodyRows.join("")}</table>
</section>`;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

async function writeExportAudit(
  params: ExportParams,
  ctx: ExportContext,
  fileName: string,
  format: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: params.actor.id,
      actorName: params.actor.displayName,
      action: "EXPORT",
      entityType: "Export",
      entityId: null,
      after: { scope: params.scope, weekId: ctx.weekId, weekNo: ctx.weekNo, fileName, format },
      reason: `scope=${params.scope};week=${ctx.weekId}`,
    },
  });
}
