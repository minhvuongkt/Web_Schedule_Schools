/**
 * Pure workload engine: expected (TeachingAssignment) vs scheduled
 * (TimetableEntry) lessons per teacher. Never trust manually entered
 * surplus/shortage values (PCPN fixture fact) — difference is always
 * recomputed here.
 */

export interface WorkloadAssignmentInput {
  id?: string;
  teacherId: string;
  classId: string | null;
  subjectId: string | null;
  subjectComponentId: string | null;
  lessonsPerWeek: number;
  assignmentType: string;
}

export interface WorkloadEntryInput {
  id: string;
  teacherId: string;
  academicDayId: string;
  periodId: string;
  status: string;
}

export interface WorkloadSubstitutionInput {
  entryId: string;
  originalTeacherId: string;
  substituteTeacherId: string;
  status: string;
}

export interface TeacherWorkload {
  teacherId: string;
  expectedTeaching: number;
  dutyLessons: number;
  scheduled: number;
  difference: number;
}

const OWN_TEACHER_ENTRY_STATUSES: ReadonlySet<string> = new Set(["NORMAL", "MOVED", "MAKEUP"]);
const SUBSTITUTED_STATUS = "SUBSTITUTED";
const CONFIRMED_STATUS = "CONFIRMED";

export function computeTeacherWorkloads(
  assignments: WorkloadAssignmentInput[],
  entries: WorkloadEntryInput[],
  substitutions: WorkloadSubstitutionInput[],
  teacherIds?: string[],
): Map<string, TeacherWorkload> {
  const workloads = new Map<string, TeacherWorkload>();
  const ensure = (teacherId: string): TeacherWorkload => {
    const existing = workloads.get(teacherId);
    if (existing !== undefined) return existing;
    const created: TeacherWorkload = { teacherId, expectedTeaching: 0, dutyLessons: 0, scheduled: 0, difference: 0 };
    workloads.set(teacherId, created);
    return created;
  };

  for (const teacherId of teacherIds ?? []) ensure(teacherId);

  for (const assignment of assignments) {
    const workload = ensure(assignment.teacherId);
    if (assignment.assignmentType === "TEACHING") workload.expectedTeaching += assignment.lessonsPerWeek;
    else if (assignment.assignmentType === "DUTY") workload.dutyLessons += assignment.lessonsPerWeek;
  }

  // Scheduled is substitution-aware by design: NORMAL/MOVED/MAKEUP count for
  // the entry's own teacher; a SUBSTITUTED lesson counts only for the
  // substitute of a CONFIRMED substitution — PENDING/CANCELLED count for
  // nobody and the original teacher never regains it (the entry status stays
  // SUBSTITUTED, mirroring Substitution semantics in the Prisma schema).
  const substitutionByEntryId = new Map<string, WorkloadSubstitutionInput>();
  for (const substitution of substitutions) substitutionByEntryId.set(substitution.entryId, substitution);

  for (const entry of entries) {
    // Every entry's teacher participates in the timetable, even when the
    // lesson ultimately counts for nobody (CANCELLED, or SUBSTITUTED without
    // a CONFIRMED substitution) — the dashboard must still show them at 0.
    ensure(entry.teacherId);
    if (OWN_TEACHER_ENTRY_STATUSES.has(entry.status)) {
      ensure(entry.teacherId).scheduled += 1;
      continue;
    }
    if (entry.status === SUBSTITUTED_STATUS) {
      const substitution = substitutionByEntryId.get(entry.id);
      if (substitution !== undefined && substitution.status === CONFIRMED_STATUS) {
        ensure(substitution.substituteTeacherId).scheduled += 1;
      }
    }
  }

  for (const workload of workloads.values()) {
    workload.difference = workload.scheduled - workload.expectedTeaching;
  }

  return workloads;
}

// ---------------------------------------------------------------------------
// Assignment coverage + workload warnings (master prompt §8 warning set —
// these need assignment data, which the conflict engine deliberately does
// not take; the service layer feeds both engines' results to validators
// and dashboards).
// ---------------------------------------------------------------------------

/** Entry shape with the class/subject fields coverage matching needs. */
export interface CoverageEntryInput extends WorkloadEntryInput {
  classId: string;
  subjectId: string;
  subjectComponentId: string | null;
}

/** Assignment shape with identity (coverage rows are per-assignment). */
export interface CoverageAssignmentInput extends WorkloadAssignmentInput {
  id: string;
}

export interface AssignmentCoverage {
  assignmentId: string;
  teacherId: string;
  classId: string | null;
  subjectId: string | null;
  subjectComponentId: string | null;
  lessonsPerWeek: number;
  scheduled: number;
  missing: number;
}

function coverageKey(assignment: {
  teacherId: string;
  classId: string | null;
  subjectId: string | null;
  subjectComponentId: string | null;
}): string {
  return [
    assignment.teacherId,
    assignment.classId ?? "-",
    assignment.subjectId ?? "-",
    assignment.subjectComponentId ?? "-",
  ].join("|");
}

/**
 * Per-assignment scheduled counts. TEACHING assignments are matched to
 * active (non-CANCELLED) entries by (teacher, class, subject, component);
 * a SUBSTITUTED lesson still fulfills the original assignment's demand —
 * coverage measures the timetable, not who delivers it. DUTY assignments
 * have no timetable representation and are skipped.
 */
export function computeAssignmentCoverage(
  assignments: CoverageAssignmentInput[],
  entries: CoverageEntryInput[],
): Map<string, AssignmentCoverage> {
  const scheduledByKey = new Map<string, number>();
  for (const entry of entries) {
    if (entry.status === "CANCELLED") continue;
    const key = coverageKey(entry);
    scheduledByKey.set(key, (scheduledByKey.get(key) ?? 0) + 1);
  }

  const result = new Map<string, AssignmentCoverage>();
  for (const assignment of assignments) {
    if (assignment.assignmentType !== "TEACHING") continue;
    const scheduled = scheduledByKey.get(coverageKey(assignment)) ?? 0;
    result.set(assignment.id, {
      assignmentId: assignment.id,
      teacherId: assignment.teacherId,
      classId: assignment.classId,
      subjectId: assignment.subjectId,
      subjectComponentId: assignment.subjectComponentId,
      lessonsPerWeek: assignment.lessonsPerWeek,
      scheduled,
      missing: Math.max(0, assignment.lessonsPerWeek - scheduled),
    });
  }
  return result;
}

export type WorkloadIssueCode =
  | "WORKLOAD_OVER_EXPECTED"
  | "WORKLOAD_BELOW_EXPECTED"
  | "ASSIGNMENT_NOT_FULLY_SCHEDULED";

export interface WorkloadIssue {
  code: WorkloadIssueCode;
  message: string;
  details: Record<string, unknown>;
}

/**
 * Workload warnings over computed workloads + coverage. These mirror the
 * conflict engine's warning shape so validators can merge both lists.
 */
export function computeWorkloadIssues(
  workloads: Map<string, TeacherWorkload>,
  coverage: Map<string, AssignmentCoverage>,
): WorkloadIssue[] {
  const issues: WorkloadIssue[] = [];
  for (const workload of workloads.values()) {
    if (workload.difference > 0) {
      issues.push({
        code: "WORKLOAD_OVER_EXPECTED",
        message: `Giáo viên ${workload.teacherId} đã xếp ${workload.scheduled} tiết, vượt ${workload.expectedTeaching} tiết được phân công.`,
        details: { ...workload },
      });
    } else if (workload.difference < 0) {
      issues.push({
        code: "WORKLOAD_BELOW_EXPECTED",
        message: `Giáo viên ${workload.teacherId} mới xếp ${workload.scheduled}/${workload.expectedTeaching} tiết được phân công.`,
        details: { ...workload },
      });
    }
  }
  for (const row of coverage.values()) {
    if (row.missing > 0) {
      issues.push({
        code: "ASSIGNMENT_NOT_FULLY_SCHEDULED",
        message: `Phân công ${row.assignmentId} còn thiếu ${row.missing}/${row.lessonsPerWeek} tiết chưa được xếp.`,
        details: { ...row },
      });
    }
  }
  return issues;
}
