/**
 * Pure conflict-validation engine over timetable entries. No DB/IO imports:
 * callers map Prisma rows to ConflictEntryInput and translate issues into the
 * API error envelope. Reused by manual editing, drag/drop, import, bulk
 * operations, publish checks and a future solver.
 *
 * WORKLOAD_OVER_EXPECTED / WORKLOAD_BELOW_EXPECTED /
 * ASSIGNMENT_NOT_FULLY_SCHEDULED warnings belong to the workload engine /
 * service layer (they need assignment data); this module covers slot,
 * reference, period, version-mutability, availability, consecutive-load and
 * room-capacity checks.
 */

export type HardConflictCode =
  | "CLASS_DOUBLE_BOOKED"
  | "TEACHER_DOUBLE_BOOKED"
  | "ROOM_DOUBLE_BOOKED"
  | "INVALID_REFERENCE"
  | "INVALID_PERIOD"
  | "PUBLISHED_VERSION_MUTATION";

export type WarningCode =
  | "WORKLOAD_OVER_EXPECTED"
  | "WORKLOAD_BELOW_EXPECTED"
  | "ASSIGNMENT_NOT_FULLY_SCHEDULED"
  | "ROOM_CAPACITY_WARNING"
  | "UNUSUAL_CONSECUTIVE_LOAD"
  | "TEACHER_UNAVAILABLE";

export type IssueCode = HardConflictCode | WarningCode;
export type IssueSeverity = "ERROR" | "WARNING";

export interface ConflictEntryInput {
  id: string;
  versionId: string;
  versionStatus: string;
  academicDayId: string;
  periodId: string;
  classId: string;
  teacherId: string;
  subjectId: string;
  subjectComponentId: string | null;
  roomId: string | null;
  status: string;
}

export interface ConflictContext {
  days: Map<string, { isSchoolDay: boolean; dayOfWeek: number }>;
  periods: Map<string, { sessionId: string; orderNo: number }>;
  classes: Map<string, { code: string; studentCount: number | null }>;
  teachers: Map<string, { code: string; fullName: string }>;
  subjects: Map<string, { code: string }>;
  rooms: Map<string, { code: string; capacity: number | null }>;
  teacherAvailability: Map<string, Map<number, "AVAILABLE" | "UNAVAILABLE" | "PREFERRED">>;
}

export interface ConflictIssue {
  code: IssueCode;
  severity: IssueSeverity;
  message: string;
  details: Record<string, unknown>;
}

export interface ConflictOptions {
  blockingWarnings?: WarningCode[];
  consecutiveLoadThreshold?: number;
  editableStatuses?: string[];
}

export interface ValidationResult {
  errors: ConflictIssue[];
  warnings: ConflictIssue[];
}

export type IssueCounts = Partial<Record<IssueCode, number>>;

interface ConsecutiveRunGroup {
  teacherId: string;
  academicDayId: string;
  dayOfWeek: number;
  sessionId: string;
  entriesByOrderNo: Map<number, ConflictEntryInput[]>;
}

const CANCELLED_STATUS = "CANCELLED";
const UNAVAILABLE_STATUS = "UNAVAILABLE";
const DEFAULT_CONSECUTIVE_THRESHOLD = 4;
const DEFAULT_EDITABLE_STATUSES: readonly string[] = ["DRAFT"];

function isActive(entry: ConflictEntryInput): boolean {
  return entry.status !== CANCELLED_STATUS;
}

function weekdayLabelVi(dayOfWeek: number): string {
  return dayOfWeek === 7 ? "Chủ nhật" : `thứ ${dayOfWeek + 1}`;
}

export function validateEntries(
  entries: ConflictEntryInput[],
  ctx: ConflictContext,
  options: ConflictOptions = {},
): ValidationResult {
  const blockingWarnings = new Set<WarningCode>(options.blockingWarnings ?? []);
  const consecutiveThreshold = options.consecutiveLoadThreshold ?? DEFAULT_CONSECUTIVE_THRESHOLD;
  const editableStatuses = options.editableStatuses ?? DEFAULT_EDITABLE_STATUSES;

  const errors: ConflictIssue[] = [];
  const warnings: ConflictIssue[] = [];

  const addError = (code: HardConflictCode, message: string, details: Record<string, unknown>): void => {
    errors.push({ code, severity: "ERROR", message, details });
  };
  const addWarning = (code: WarningCode, message: string, details: Record<string, unknown>): void => {
    if (blockingWarnings.has(code)) errors.push({ code, severity: "ERROR", message, details });
    else warnings.push({ code, severity: "WARNING", message, details });
  };

  const classLabel = (classId: string): string => ctx.classes.get(classId)?.code ?? classId;
  const teacherLabel = (teacherId: string): string => {
    const teacher = ctx.teachers.get(teacherId);
    return teacher === undefined ? teacherId : `${teacher.fullName} (${teacher.code})`;
  };
  const roomLabel = (roomId: string): string => ctx.rooms.get(roomId)?.code ?? roomId;
  const slotLabel = (academicDayId: string, periodId: string): string => {
    const day = ctx.days.get(academicDayId);
    const period = ctx.periods.get(periodId);
    const dayPart = day === undefined ? `ngày ${academicDayId}` : weekdayLabelVi(day.dayOfWeek);
    const periodPart = period === undefined ? `tiết ${periodId}` : `tiết ${period.orderNo}`;
    return `${dayPart}, ${periodPart}`;
  };

  for (const entry of entries) {
    if (!ctx.classes.has(entry.classId)) {
      addError("INVALID_REFERENCE", `Tiết học ${entry.id} tham chiếu lớp không tồn tại: "${entry.classId}".`, { entryId: entry.id, field: "classId", value: entry.classId });
    }
    if (!ctx.teachers.has(entry.teacherId)) {
      addError("INVALID_REFERENCE", `Tiết học ${entry.id} tham chiếu giáo viên không tồn tại: "${entry.teacherId}".`, { entryId: entry.id, field: "teacherId", value: entry.teacherId });
    }
    if (!ctx.subjects.has(entry.subjectId)) {
      addError("INVALID_REFERENCE", `Tiết học ${entry.id} tham chiếu môn học không tồn tại: "${entry.subjectId}".`, { entryId: entry.id, field: "subjectId", value: entry.subjectId });
    }
    if (entry.roomId !== null && !ctx.rooms.has(entry.roomId)) {
      addError("INVALID_REFERENCE", `Tiết học ${entry.id} tham chiếu phòng học không tồn tại: "${entry.roomId}".`, { entryId: entry.id, field: "roomId", value: entry.roomId });
    }

    const day = ctx.days.get(entry.academicDayId);
    if (!ctx.periods.has(entry.periodId)) {
      addError("INVALID_PERIOD", `Tiết học ${entry.id} dùng tiết (period) không tồn tại: "${entry.periodId}".`, { entryId: entry.id, periodId: entry.periodId });
    }
    if (day === undefined) {
      addError("INVALID_PERIOD", `Tiết học ${entry.id} tham chiếu ngày học không tồn tại: "${entry.academicDayId}".`, { entryId: entry.id, academicDayId: entry.academicDayId });
    } else if (!day.isSchoolDay) {
      addError("INVALID_PERIOD", `Tiết học ${entry.id} rơi vào ngày không phải ngày học (${weekdayLabelVi(day.dayOfWeek)}, ${entry.academicDayId}).`, { entryId: entry.id, academicDayId: entry.academicDayId, dayOfWeek: day.dayOfWeek, isSchoolDay: false });
    }

    if (!editableStatuses.includes(entry.versionStatus)) {
      addError("PUBLISHED_VERSION_MUTATION", `Không thể thay đổi tiết học ${entry.id}: phiên bản đang ở trạng thái ${entry.versionStatus} (chỉ cho phép chỉnh sửa ở ${editableStatuses.join(", ")}).`, { entryId: entry.id, versionId: entry.versionId, versionStatus: entry.versionStatus, editableStatuses: [...editableStatuses] });
    }
  }

  const checkDoubleBooked = (
    code: "CLASS_DOUBLE_BOOKED" | "TEACHER_DOUBLE_BOOKED" | "ROOM_DOUBLE_BOOKED",
    resourceOf: (entry: ConflictEntryInput) => string | null,
  ): void => {
    const groups = new Map<string, { resource: string; entries: ConflictEntryInput[] }>();
    for (const entry of entries) {
      if (!isActive(entry)) continue;
      const resource = resourceOf(entry);
      if (resource === null) continue;
      const key = `${entry.versionId}|${entry.academicDayId}|${entry.periodId}|${resource}`;
      const group = groups.get(key);
      if (group === undefined) groups.set(key, { resource, entries: [entry] });
      else group.entries.push(entry);
    }
    for (const group of groups.values()) {
      for (let i = 0; i < group.entries.length; i++) {
        for (let j = i + 1; j < group.entries.length; j++) {
          const first = group.entries[i];
          const second = group.entries[j];
          const slot = slotLabel(first.academicDayId, first.periodId);
          const base: Record<string, unknown> = {
            entryIds: [first.id, second.id],
            entryId: first.id,
            conflictingEntryId: second.id,
            academicDayId: first.academicDayId,
            periodId: first.periodId,
            versionId: first.versionId,
          };
          if (code === "CLASS_DOUBLE_BOOKED") {
            addError(code, `Lớp ${classLabel(group.resource)} bị trùng lịch: hai tiết học cùng thời điểm (${slot}).`, { ...base, classId: group.resource });
          } else if (code === "TEACHER_DOUBLE_BOOKED") {
            addError(code, `Giáo viên ${teacherLabel(group.resource)} bị trùng lịch: dạy hai lớp cùng thời điểm (${slot}).`, { ...base, teacherId: group.resource, classIds: [first.classId, second.classId] });
          } else {
            addError(code, `Phòng ${roomLabel(group.resource)} bị trùng lịch: hai tiết học cùng sử dụng (${slot}).`, { ...base, roomId: group.resource });
          }
        }
      }
    }
  };

  checkDoubleBooked("CLASS_DOUBLE_BOOKED", entry => entry.classId);
  checkDoubleBooked("TEACHER_DOUBLE_BOOKED", entry => entry.teacherId);
  checkDoubleBooked("ROOM_DOUBLE_BOOKED", entry => entry.roomId);

  for (const entry of entries) {
    if (!isActive(entry)) continue;
    const day = ctx.days.get(entry.academicDayId);
    if (day === undefined) continue;
    const availability = ctx.teacherAvailability.get(entry.teacherId)?.get(day.dayOfWeek);
    if (availability === UNAVAILABLE_STATUS) {
      addWarning("TEACHER_UNAVAILABLE", `Giáo viên ${teacherLabel(entry.teacherId)} đăng ký nghỉ ${weekdayLabelVi(day.dayOfWeek)} nhưng vẫn được xếp tiết (${slotLabel(entry.academicDayId, entry.periodId)}).`, { entryId: entry.id, teacherId: entry.teacherId, academicDayId: entry.academicDayId, periodId: entry.periodId, dayOfWeek: day.dayOfWeek });
    }
  }

  const runGroups = new Map<string, ConsecutiveRunGroup>();
  for (const entry of entries) {
    if (!isActive(entry)) continue;
    const period = ctx.periods.get(entry.periodId);
    const day = ctx.days.get(entry.academicDayId);
    if (period === undefined || day === undefined) continue;
    const key = `${entry.versionId}|${entry.teacherId}|${entry.academicDayId}|${period.sessionId}`;
    let group = runGroups.get(key);
    if (group === undefined) {
      group = {
        teacherId: entry.teacherId,
        academicDayId: entry.academicDayId,
        dayOfWeek: day.dayOfWeek,
        sessionId: period.sessionId,
        entriesByOrderNo: new Map<number, ConflictEntryInput[]>(),
      };
      runGroups.set(key, group);
    }
    const list = group.entriesByOrderNo.get(period.orderNo);
    if (list === undefined) group.entriesByOrderNo.set(period.orderNo, [entry]);
    else list.push(entry);
  }
  for (const group of runGroups.values()) {
    const orderNos = [...group.entriesByOrderNo.keys()].sort((a, b) => a - b);
    let runStart = 0;
    for (let i = 1; i <= orderNos.length; i++) {
      const runEnds = i === orderNos.length || orderNos[i] !== orderNos[i - 1] + 1;
      if (!runEnds) continue;
      const runLength = i - runStart;
      if (runLength >= consecutiveThreshold) {
        const runOrderNos = orderNos.slice(runStart, i);
        const entryIds: string[] = [];
        for (const orderNo of runOrderNos) {
          for (const runEntry of group.entriesByOrderNo.get(orderNo) ?? []) entryIds.push(runEntry.id);
        }
        addWarning("UNUSUAL_CONSECUTIVE_LOAD", `Giáo viên ${teacherLabel(group.teacherId)} dạy ${runLength} tiết liên tiếp (${weekdayLabelVi(group.dayOfWeek)}, buổi ${group.sessionId}).`, {
          teacherId: group.teacherId,
          academicDayId: group.academicDayId,
          sessionId: group.sessionId,
          orderNos: runOrderNos,
          entryIds,
          consecutiveCount: runLength,
          threshold: consecutiveThreshold,
        });
      }
      runStart = i;
    }
  }

  for (const entry of entries) {
    if (!isActive(entry)) continue;
    if (entry.roomId === null) continue;
    const room = ctx.rooms.get(entry.roomId);
    const klass = ctx.classes.get(entry.classId);
    if (room === undefined || room.capacity === null) continue;
    if (klass === undefined || klass.studentCount === null) continue;
    if (room.capacity < klass.studentCount) {
      addWarning("ROOM_CAPACITY_WARNING", `Phòng ${roomLabel(entry.roomId)} chỉ chứa ${room.capacity} chỗ, nhỏ hơn sĩ số lớp ${classLabel(entry.classId)} (${klass.studentCount} học sinh).`, { entryId: entry.id, roomId: entry.roomId, classId: entry.classId, capacity: room.capacity, studentCount: klass.studentCount });
    }
  }

  return { errors, warnings };
}

export function summarizeIssues(result: ValidationResult): IssueCounts {
  const counts: IssueCounts = {};
  const bump = (code: IssueCode): void => {
    counts[code] = (counts[code] ?? 0) + 1;
  };
  for (const issue of result.errors) bump(issue.code);
  for (const issue of result.warnings) bump(issue.code);
  return counts;
}
