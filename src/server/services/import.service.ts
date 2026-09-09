/**
 * Excel TKB import: two-phase (preview → commit), all-or-nothing.
 *
 * Phase 1 — previewImport: parse (pure module) + map against DB catalogs +
 * conflict-validate a HYPOTHETICAL entry set (no writes; dates outside the
 * target week are reported as UNSUPPORTED_DATE issues instead of failing).
 *
 * Phase 2 — commitImport: re-parses and RE-VALIDATES inside ONE
 * prisma.$transaction (the preview is never trusted). Any hard conflict,
 * unmappable entry or out-of-week date throws BEFORE the first write, so a
 * failed import leaves zero rows behind (docs/timetable-rules.md §7).
 * On success: missing AcademicDays for in-week dates with lessons are
 * created, a NEW DRAFT TimetableVersion is created (versionNo = max+1),
 * entries are bulk-inserted with sourceRow preserved, the version revision
 * is bumped and an IMPORT AuditLog row is written.
 *
 * Out of scope (documented): TeachingAssignment (PCPN) import — expected
 * workload is not touched by this round; coverage/workload warnings belong
 * to the workload engine and are surfaced by version validation instead.
 *
 * Subject labels ("Toán", "KHTN(L)", …) are Excel labels, never IDs. The
 * authoritative label→(subject, component) map comes from
 * database/fixtures/week1/subjects.json observedLabels (the verified source
 * catalog), augmented with DB-derived labels (subject/component names and
 * codes) so future workbooks can resolve without the fixture file.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "@/server/db";
import {
  findTkbSheet,
  insertLabel,
  isoWeekdayOf,
  mapEntries,
  parseTkbSheet,
  type ClassRef,
  type ImportIssue,
  type MappedTkbEntry,
  type ParseResult,
  type SubjectRef,
  type TeacherRef,
  type TkbMapContext,
  type UnmappedTkbEntry,
} from "@/server/domain/excel-parse";
import {
  validateEntries,
  type ConflictContext,
  type ConflictEntryInput,
} from "@/server/domain/conflict";
import { normalizeName } from "@/server/domain/normalize";
import { assertPermission, type Role } from "@/server/domain/roles";
import type { SessionUser } from "@/server/services/auth.service";
import { dateToIso, findActiveSchoolYear, resolveActiveWeek, todayIso } from "@/server/services/school-calendar";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Db = typeof prisma | Tx;

export class ImportError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

// ---------------------------------------------------------------------------
// Week resolution
// ---------------------------------------------------------------------------

export interface ImportWeek {
  id: string;
  weekNo: number;
  weekStart: string;
  weekEnd: string;
}

interface WeekRow {
  id: string;
  weekNo: number;
  startDate: Date;
  endDate: Date;
  schoolYearId: string | null;
  semester: { schoolYearId: string } | null;
}

function toImportWeek(row: WeekRow): ImportWeek {
  return {
    id: row.id,
    weekNo: row.weekNo,
    weekStart: dateToIso(row.startDate),
    weekEnd: dateToIso(row.endDate),
  };
}

const WEEK_SELECT = {
  id: true,
  weekNo: true,
  startDate: true,
  endDate: true,
  schoolYearId: true,
  semester: { select: { schoolYearId: true } },
} as const;

/** weekId when given (must exist); else the active week. */
async function resolveImportWeek(db: Db, weekId?: string): Promise<{ week: ImportWeek; schoolYearId: string }> {
  if (weekId) {
    const row = await db.week.findUnique({ where: { id: weekId }, select: WEEK_SELECT });
    if (!row) {
      throw new ImportError("WEEK_NOT_FOUND", "Không tìm thấy tuần học.", { weekId }, 404);
    }
    return finishWeek(row);
  }
  const year = await findActiveSchoolYear();
  if (!year) {
    throw new ImportError("NO_ACTIVE_SCHOOL_YEAR", "Không có năm học đang hoạt động.", {}, 400);
  }
  const active = await resolveActiveWeek(year.id, todayIso());
  if (!active) {
    throw new ImportError("NO_ACTIVE_WEEK", "Không xác định được tuần hiện tại.", {}, 400);
  }
  const row = await db.week.findUnique({ where: { id: active.id }, select: WEEK_SELECT });
  if (!row) {
    throw new ImportError("WEEK_NOT_FOUND", "Không tìm thấy tuần học.", { weekId: active.id }, 404);
  }
  return finishWeek(row);
}

function finishWeek(row: WeekRow): { week: ImportWeek; schoolYearId: string } {
  const schoolYearId = row.schoolYearId ?? row.semester?.schoolYearId;
  if (!schoolYearId) {
    throw new ImportError("NO_SCHOOL_YEAR", "Không xác định được năm học của tuần.", { weekId: row.id }, 400);
  }
  return { week: toImportWeek(row), schoolYearId };
}

// ---------------------------------------------------------------------------
// Workbook parsing (pure module + workbook-level errors)
// ---------------------------------------------------------------------------

function parseWorkbookTkb(fileBuffer: Buffer): { parsed: ParseResult; sheetName: string } {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: "buffer" });
  } catch {
    throw new ImportError(
      "PARSE_ERROR",
      "Không đọc được tệp Excel (tệp hỏng hoặc định dạng không hỗ trợ).",
      {},
      400,
    );
  }
  const found = findTkbSheet(workbook);
  if (!found) {
    throw new ImportError(
      "TKB_SHEET_NOT_FOUND",
      "Không tìm thấy trang tính thời khóa biểu (tên trang tính phải chứa 'TKB').",
      { sheetNames: workbook.SheetNames },
      400,
    );
  }
  return { parsed: parseTkbSheet(found.sheet), sheetName: found.name };
}

// ---------------------------------------------------------------------------
// Mapping context (Excel labels → DB identities)
// ---------------------------------------------------------------------------

interface FixtureSubjectEntry {
  code: string;
  name: string;
  component: string | null;
  observedLabels: string[];
}

let subjectLabelFixtureCache: FixtureSubjectEntry[] | null | undefined;

function loadSubjectLabelFixture(): FixtureSubjectEntry[] | null {
  if (subjectLabelFixtureCache !== undefined) return subjectLabelFixtureCache;
  try {
    const raw = readFileSync(
      path.join(process.cwd(), "database", "fixtures", "week1", "subjects.json"),
      "utf8",
    );
    subjectLabelFixtureCache = JSON.parse(raw) as FixtureSubjectEntry[];
  } catch {
    // The fixture catalog is the authoritative source for THIS workbook's
    // labels; without it only DB-derived labels resolve (and imports of
    // abbreviated labels will surface UNKNOWN_SUBJECT issues).
    subjectLabelFixtureCache = null;
  }
  return subjectLabelFixtureCache;
}

export interface MapContextBundle {
  ctx: TkbMapContext;
  classById: Map<string, { code: string; name: string | null }>;
  teacherById: Map<string, { code: string; fullName: string }>;
  subjectById: Map<string, { name: string; componentNames: Map<string, string> }>;
}

async function buildMapContext(db: Db, schoolYearId: string): Promise<MapContextBundle> {
  const [classes, teachers, aliases, subjects] = await Promise.all([
    db.class.findMany({
      where: { schoolYearId },
      select: { id: true, code: true, name: true },
      orderBy: [{ grade: "asc" }, { code: "asc" }],
    }),
    db.teacher.findMany({
      select: { id: true, code: true, fullName: true, shortName: true },
      orderBy: { code: "asc" },
    }),
    db.teacherAlias.findMany({ select: { alias: true, teacherId: true } }),
    db.subject.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        components: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);

  const classesByCode = new Map<string, ClassRef>();
  const classById = new Map<string, { code: string; name: string | null }>();
  for (const klass of classes) {
    insertLabel(classesByCode, klass.code, { id: klass.id, code: klass.code });
    classById.set(klass.id, { code: klass.code, name: klass.name });
  }

  const teacherById = new Map<string, { code: string; fullName: string }>();
  const teachersByAlias = new Map<string, TeacherRef>();
  for (const teacher of teachers) {
    const ref = { id: teacher.id, code: teacher.code, fullName: teacher.fullName };
    teacherById.set(teacher.id, ref);
    insertLabel(teachersByAlias, teacher.fullName, ref);
    if (teacher.shortName) insertLabel(teachersByAlias, teacher.shortName, ref);
  }
  for (const alias of aliases) {
    const teacher = teacherById.get(alias.teacherId);
    if (teacher) insertLabel(teachersByAlias, alias.alias, teacher);
  }

  const subjectsByLabel = new Map<string, SubjectRef>();
  const subjectById = new Map<string, { name: string; componentNames: Map<string, string> }>();
  for (const subject of subjects) {
    subjectById.set(subject.id, {
      name: subject.name,
      componentNames: new Map(subject.components.map((c) => [c.id, c.name])),
    });
  }

  // Authoritative observed labels first (fixture catalog), then DB-derived
  // labels (names/codes, "Subject(Component)" forms) as fallbacks.
  const fixture = loadSubjectLabelFixture();
  if (fixture) {
    for (const entry of fixture) {
      const subject = subjects.find(
        (s) => s.code === entry.code || normalizeName(s.name) === normalizeName(entry.name),
      );
      if (!subject) continue;
      const componentId =
        entry.component === null
          ? null
          : subject.components.find((c) => c.code === entry.component)?.id ?? null;
      const ref: SubjectRef = { subjectId: subject.id, subjectComponentId: componentId };
      for (const label of entry.observedLabels) insertLabel(subjectsByLabel, label, ref);
    }
  }
  for (const subject of subjects) {
    insertLabel(subjectsByLabel, subject.name, { subjectId: subject.id, subjectComponentId: null });
    insertLabel(subjectsByLabel, subject.code, { subjectId: subject.id, subjectComponentId: null });
    for (const component of subject.components) {
      const ref: SubjectRef = { subjectId: subject.id, subjectComponentId: component.id };
      insertLabel(subjectsByLabel, `${subject.name}(${component.code})`, ref);
      insertLabel(subjectsByLabel, `${subject.name}(${component.name})`, ref);
      insertLabel(subjectsByLabel, component.name, ref);
    }
  }

  return { ctx: { classesByCode, teachersByAlias, subjectsByLabel }, classById, teacherById, subjectById };
}

// ---------------------------------------------------------------------------
// Hypothetical conflict context (preview) / real context (commit)
// ---------------------------------------------------------------------------

interface ValidationContext {
  conflict: ConflictContext;
  periodIdBySlot: Map<string, string>; // "MORNING#1" → period id
  dayIdByDate: Map<string, string>; // existing AcademicDay ids
}

async function buildValidationContext(db: Db, week: ImportWeek, schoolYearId: string): Promise<ValidationContext> {
  const [days, periods, classes, teachers, subjects, rooms, availability] = await Promise.all([
    db.academicDay.findMany({
      where: { weekId: week.id },
      select: { id: true, date: true, dayOfWeek: true, isSchoolDay: true },
    }),
    db.period.findMany({
      where: { session: { schoolYear: { status: "ACTIVE" } } },
      select: { id: true, orderNo: true, session: { select: { code: true } } },
      orderBy: [{ session: { orderNo: "asc" } }, { orderNo: "asc" }],
    }),
    db.class.findMany({ where: { schoolYearId }, select: { id: true, code: true } }),
    db.teacher.findMany({ select: { id: true, code: true, fullName: true } }),
    db.subject.findMany({ select: { id: true, code: true } }),
    db.room.findMany({ select: { id: true, code: true, capacity: true } }),
    db.teacherAvailability.findMany({
      where: { schoolYearId },
      select: { teacherId: true, dayOfWeek: true, status: true },
    }),
  ]);

  const dayIdByDate = new Map<string, string>();
  const dayMap = new Map<string, { isSchoolDay: boolean; dayOfWeek: number }>();
  for (const day of days) {
    const iso = dateToIso(day.date);
    dayIdByDate.set(iso, day.id);
    dayMap.set(day.id, { isSchoolDay: day.isSchoolDay, dayOfWeek: day.dayOfWeek });
  }
  // Hypothetical days for in-week dates that have no AcademicDay yet — the
  // engine keys days by id, so preview entries use "date:<iso>" keys there.
  for (let iso = week.weekStart; iso <= week.weekEnd; iso = addDaysIso(iso, 1)) {
    if (!dayIdByDate.has(iso)) {
      dayMap.set(`date:${iso}`, { isSchoolDay: true, dayOfWeek: isoWeekdayOf(iso) });
    }
  }

  const periodIdBySlot = new Map<string, string>();
  const periodMap = new Map<string, { sessionId: string; orderNo: number }>();
  for (const period of periods) {
    periodIdBySlot.set(`${period.session.code}#${period.orderNo}`, period.id);
    periodMap.set(period.id, { sessionId: period.session.code, orderNo: period.orderNo });
  }

  const teacherAvailability = new Map<
    string,
    Map<number, "AVAILABLE" | "UNAVAILABLE" | "PREFERRED">
  >();
  for (const row of availability) {
    let inner = teacherAvailability.get(row.teacherId);
    if (!inner) {
      inner = new Map();
      teacherAvailability.set(row.teacherId, inner);
    }
    inner.set(row.dayOfWeek, row.status as "AVAILABLE" | "UNAVAILABLE" | "PREFERRED");
  }

  return {
    conflict: {
      days: dayMap,
      periods: periodMap,
      classes: new Map(classes.map((c) => [c.id, { code: c.code, studentCount: null }])),
      teachers: new Map(teachers.map((t) => [t.id, { code: t.code, fullName: t.fullName }])),
      subjects: new Map(subjects.map((s) => [s.id, { code: s.code }])),
      rooms: new Map(rooms.map((r) => [r.id, { code: r.code, capacity: r.capacity }])),
      teacherAvailability,
    },
    periodIdBySlot,
    dayIdByDate,
  };
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayKeyFor(dateIso: string, dayIdByDate: Map<string, string>): string {
  return dayIdByDate.get(dateIso) ?? `date:${dateIso}`;
}

function toConflictInputs(
  entries: MappedTkbEntry[],
  dayIdByDate: Map<string, string>,
  periodIdBySlot: Map<string, string>,
): ConflictEntryInput[] {
  return entries.map((entry, index) => ({
    id: `import-${index}`,
    versionId: "import",
    versionStatus: "DRAFT",
    academicDayId: dayKeyFor(entry.dateIso ?? "", dayIdByDate),
    periodId: periodIdBySlot.get(`${entry.sessionCode}#${entry.periodNo}`) ?? `unknown:${entry.sessionCode}#${entry.periodNo}`,
    classId: entry.classId,
    teacherId: entry.teacherId,
    subjectId: entry.subjectId,
    subjectComponentId: entry.subjectComponentId,
    roomId: null,
    status: "NORMAL",
  }));
}

function engineIssues(result: ReturnType<typeof validateEntries>): ImportIssue[] {
  return [
    ...result.errors.map((issue) => ({
      type: issue.code,
      severity: "ERROR" as const,
      message: issue.message,
      details: issue.details,
    })),
    ...result.warnings.map((issue) => ({
      type: issue.code,
      severity: "WARNING" as const,
      message: issue.message,
      details: issue.details,
    })),
  ];
}

// ---------------------------------------------------------------------------
// Phase 1: preview (NO writes)
// ---------------------------------------------------------------------------

export interface PreviewEntryDisplay {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  subjectComponentId: string | null;
  subjectComponentName: string | null;
  teacherId: string;
  teacherName: string;
  dayLabel: string;
  dateIso: string | null;
  sessionCode: string;
  periodNo: number;
  sourceRow: number;
}

export interface ImportPreview {
  weekId: string;
  weekNo: number;
  weekStart: string;
  weekEnd: string;
  entries: PreviewEntryDisplay[];
  unmapped: UnmappedTkbEntry[];
  issues: ImportIssue[];
  counts: { entries: number; issues: number; errors: number };
}

export async function previewImport(input: {
  fileBuffer: Buffer;
  fileName: string;
  weekId?: string;
}): Promise<{ preview: ImportPreview }> {
  const { week, schoolYearId } = await resolveImportWeek(prisma, input.weekId);
  const { parsed } = parseWorkbookTkb(input.fileBuffer);
  const bundle = await buildMapContext(prisma, schoolYearId);
  const { mapped, unmapped, issues: mapIssues } = mapEntries(parsed, bundle.ctx);

  const issues: ImportIssue[] = [...parsed.issues, ...mapIssues];

  // Dates outside the target week (or unknown because the sheet had no
  // declared range) are reported, not written — commit refuses them.
  const outOfWeek = new Map<string, { count: number; dayLabels: Set<string> }>();
  const inWeek: MappedTkbEntry[] = [];
  for (const entry of mapped) {
    if (
      entry.dateIso === null ||
      entry.dateIso < week.weekStart ||
      entry.dateIso > week.weekEnd
    ) {
      const key = entry.dateIso ?? "";
      const group = outOfWeek.get(key) ?? { count: 0, dayLabels: new Set<string>() };
      group.count += 1;
      group.dayLabels.add(entry.dayLabel);
      outOfWeek.set(key, group);
      continue;
    }
    inWeek.push(entry);
  }
  for (const [dateIso, group] of outOfWeek) {
    issues.push({
      type: "UNSUPPORTED_DATE",
      severity: "ERROR",
      message: `${[...group.dayLabels].join(", ")} (${dateIso || "không rõ ngày"}) có ${group.count} tiết nằm ngoài tuần ${week.weekStart} → ${week.weekEnd}.`,
      details: {
        dateIso: dateIso || null,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        entryCount: group.count,
        dayLabels: [...group.dayLabels],
      },
    });
  }

  const validation = await buildValidationContext(prisma, week, schoolYearId);
  const result = validateEntries(toConflictInputs(inWeek, validation.dayIdByDate, validation.periodIdBySlot), validation.conflict);
  issues.push(...engineIssues(result));

  const entries: PreviewEntryDisplay[] = mapped.map((entry) => {
    const klass = bundle.classById.get(entry.classId);
    const subject = bundle.subjectById.get(entry.subjectId);
    const teacher = bundle.teacherById.get(entry.teacherId);
    return {
      classId: entry.classId,
      className: klass ? klass.name ?? klass.code : entry.classId,
      subjectId: entry.subjectId,
      subjectName: subject?.name ?? entry.subjectId,
      subjectComponentId: entry.subjectComponentId,
      subjectComponentName:
        entry.subjectComponentId !== null
          ? subject?.componentNames.get(entry.subjectComponentId) ?? null
          : null,
      teacherId: entry.teacherId,
      teacherName: teacher?.fullName ?? entry.teacherId,
      dayLabel: entry.dayLabel,
      dateIso: entry.dateIso,
      sessionCode: entry.sessionCode,
      periodNo: entry.periodNo,
      sourceRow: entry.sourceRow,
    };
  });

  return {
    preview: {
      weekId: week.id,
      weekNo: week.weekNo,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      entries,
      unmapped,
      issues,
      counts: {
        entries: mapped.length,
        issues: issues.length,
        errors: issues.filter((issue) => issue.severity === "ERROR").length,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 2: commit (single transaction, all-or-nothing)
// ---------------------------------------------------------------------------

export interface CommitResult {
  version: {
    id: string;
    weekId: string;
    versionNo: number;
    status: string;
    revision: number;
    name: string | null;
  };
  entryCount: number;
}

export async function commitImport(input: {
  fileBuffer: Buffer;
  fileName: string;
  weekId: string;
  actor: SessionUser;
}): Promise<CommitResult> {
  assertPermission(input.actor.role as Role, "import:excel");

  return prisma.$transaction(
    async (tx) => {
      const { week, schoolYearId } = await resolveImportWeek(tx, input.weekId);
      const { parsed } = parseWorkbookTkb(input.fileBuffer);
      const bundle = await buildMapContext(tx, schoolYearId);
      const { mapped, unmapped, issues: mapIssues } = mapEntries(parsed, bundle.ctx);

      if (unmapped.length > 0) {
        throw new ImportError(
          "UNMAPPABLE_ENTRIES",
          `Có ${unmapped.length} tiết học không ánh xạ được (lớp/môn/giáo viên chưa biết) — đã huỷ toàn bộ lần nhập.`,
          {
            unmapped: unmapped.slice(0, 10).map((row) => ({
              sourceRow: row.entry.sourceRow,
              classCode: row.entry.classCode,
              subjectLabel: row.entry.subjectLabel,
              teacherAlias: row.entry.teacherAlias,
              reasons: row.reasons,
            })),
            issueTypes: [...new Set(mapIssues.map((issue) => issue.type))],
          },
          422,
        );
      }

      const dated: (MappedTkbEntry & { dateIso: string })[] = [];
      for (const entry of mapped) {
        if (
          entry.dateIso === null ||
          entry.dateIso < week.weekStart ||
          entry.dateIso > week.weekEnd
        ) {
          throw new ImportError(
            "UNSUPPORTED_DATE",
            `Tiết học dòng ${entry.sourceRow} (${entry.dayLabel}) rơi vào ngày ${entry.dateIso ?? "không rõ"} ngoài tuần ${week.weekStart} → ${week.weekEnd} — đã huỷ toàn bộ lần nhập.`,
            {
              sourceRow: entry.sourceRow,
              dayLabel: entry.dayLabel,
              dateIso: entry.dateIso,
              weekStart: week.weekStart,
              weekEnd: week.weekEnd,
            },
            422,
          );
        }
        dated.push(entry as MappedTkbEntry & { dateIso: string });
      }

      // Create AcademicDays for in-week lesson dates that lack one.
      const existingDays = await tx.academicDay.findMany({
        where: { weekId: week.id },
        select: { id: true, date: true },
      });
      const dayIdByDate = new Map(existingDays.map((day) => [dateToIso(day.date), day.id]));
      for (const iso of new Set(dated.map((entry) => entry.dateIso))) {
        if (dayIdByDate.has(iso)) continue;
        const day = await tx.academicDay.create({
          data: {
            weekId: week.id,
            date: new Date(`${iso}T00:00:00.000Z`),
            dayOfWeek: isoWeekdayOf(iso),
            isSchoolDay: true,
          },
          select: { id: true },
        });
        dayIdByDate.set(iso, day.id);
      }

      // Re-validate inside the transaction — the preview is never trusted.
      const validation = await buildValidationContext(tx, week, schoolYearId);
      const result = validateEntries(
        toConflictInputs(dated, validation.dayIdByDate, validation.periodIdBySlot),
        validation.conflict,
      );
      if (result.errors.length > 0) {
        throw new ImportError(
          "HARD_CONFLICTS",
          `Phát hiện ${result.errors.length} xung đột nặng — đã huỷ toàn bộ lần nhập.`,
          { issues: result.errors.slice(0, 20), counts: { errors: result.errors.length } },
          409,
        );
      }

      const entryRows = dated.map((entry) => {
        const academicDayId = dayIdByDate.get(entry.dateIso);
        const periodId = validation.periodIdBySlot.get(`${entry.sessionCode}#${entry.periodNo}`);
        if (!academicDayId || !periodId) {
          throw new ImportError(
            "INVALID_PERIOD",
            `Không xác định được ngày/tiết cho tiết học dòng ${entry.sourceRow} (${entry.dayLabel}, ${entry.sessionCode} tiết ${entry.periodNo}).`,
            { sourceRow: entry.sourceRow },
            422,
          );
        }
        return {
          versionId: "",
          academicDayId,
          periodId,
          classId: entry.classId,
          subjectId: entry.subjectId,
          subjectComponentId: entry.subjectComponentId,
          teacherId: entry.teacherId,
          status: "NORMAL",
          sourceRow: entry.sourceRow,
        };
      });

      const latest = await tx.timetableVersion.findFirst({
        where: { weekId: week.id },
        orderBy: { versionNo: "desc" },
        select: { versionNo: true },
      });
      const version = await tx.timetableVersion.create({
        data: {
          weekId: week.id,
          versionNo: (latest?.versionNo ?? 0) + 1,
          status: "DRAFT",
          name: `Nhập từ ${input.fileName}`,
          createdBy: input.actor.username,
        },
        select: { id: true, versionNo: true, name: true },
      });

      await tx.timetableEntry.createMany({
        data: entryRows.map((row) => ({ ...row, versionId: version.id })),
      });

      const updated = await tx.timetableVersion.update({
        where: { id: version.id },
        data: { revision: { increment: 1 } },
        select: { revision: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.actor.id,
          actorName: input.actor.displayName,
          action: "IMPORT",
          entityType: "TimetableVersion",
          entityId: version.id,
          after: {
            entries: entryRows.length,
            source: input.fileName,
            weekId: week.id,
          },
        },
      });

      return {
        version: {
          id: version.id,
          weekId: week.id,
          versionNo: version.versionNo,
          status: "DRAFT",
          revision: updated.revision,
          name: version.name,
        },
        entryCount: entryRows.length,
      };
    },
    { timeout: 60_000 },
  );
}
