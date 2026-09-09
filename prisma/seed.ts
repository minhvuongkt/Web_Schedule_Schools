/**
 * Seed the database from the verified Week 01 fixture
 * (database/fixtures/week1 — extracted from week1_schedule.xls).
 *
 * Loads: school, academic-year skeleton (semesters + week 1 + Mon–Sat days),
 * session/period configuration, departments, 19 teachers (+aliases, day-off
 * availability), subjects with components, 8 classes with homeroom links,
 * workload policies, teaching assignments (expected workload) derived from the
 * verified TKB coverage, duties from PCPN, and one PUBLISHED timetable
 * version containing the 236 week-1 entries.
 *
 * The seed is a fixture reload, not a merge: it wipes the database first
 * (FK-safe order) and is safe to re-run. After writing, it verifies the
 * invariants documented in database/fixtures/week1/summary.json:
 *   - 236 entries, 8 classes, 19 teachers;
 *   - per-teacher scheduled counts reconcile with PCPN declared totals;
 *   - per-teacher TEACHING assignment lessons reconcile as well.
 *
 * Usage: npm run db:seed
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeName } from "../src/server/domain/normalize";
import { hashPassword } from "../src/server/domain/password";

import teachersFixture from "../database/fixtures/week1/teachers.json";
import aliasesFixture from "../database/fixtures/week1/teacher-aliases.json";
import entriesFixture from "../database/fixtures/week1/timetable-entries.json";
import summaryFixture from "../database/fixtures/week1/summary.json";

// ---------------------------------------------------------------------------
// Fixture types (JSON imports are widened; these restore precision)
// ---------------------------------------------------------------------------

interface FixtureTeacher {
  orderNo: number;
  fullName: string;
  specialty: string | null;
  position: string | null;
  department: string | null;
  teaching: {
    subjectClasses: string | null;
    lessonsPerUnit: string | null;
    totalLessons: number | null;
  };
  extraTeaching: { raw: string | null; lessons: number | null };
  duties: { raw: string | null; items: string[]; lessons: number | null };
  grandTotal: number | null;
  standardWeekly: number | null;
  variance: number | null;
  dayOff: string | null;
}

interface FixtureEntry {
  day: number; // Vietnamese weekday convention: Thứ 2 (Mon) = 2 … Thứ 7 (Sat) = 7
  date: string; // YYYY-MM-DD (authoritative — weekday is derived from this)
  session: string; // MORNING | AFTERNOON
  period: number; // 1..n within session
  periodInferred: boolean;
  classCode: string;
  subjectLabel: string;
  subjectCode: string;
  teacherAlias: string;
  teacherName: string;
  sourceRow: number;
}

const fixtureTeachers = teachersFixture as FixtureTeacher[];
const fixtureEntries = entriesFixture.entries as FixtureEntry[];

// ---------------------------------------------------------------------------
// Seeded catalogs (configurable data, not hard-coded product logic)
// ---------------------------------------------------------------------------

const SCHOOL = {
  code: "MANG-CANH",
  // Spacing normalized from the workbook header "…TH &THCS MĂNG CÀNH".
  name: "TRƯỜNG PTDTBT TH & THCS MĂNG CÀNH",
  division: "PHÂN HIỆU THCS",
  timezone: "Asia/Ho_Chi_Minh",
};

// Calendar skeleton. Only week 1 is backed by the fixture; semester dates are
// the standard Vietnamese structure and remain editable master data.
const YEAR = { name: "2026-2027", start: "2026-09-07", end: "2027-05-31" };
const SEMESTERS = [
  { name: "Học kỳ 1", start: "2026-09-07", end: "2027-01-09" },
  { name: "Học kỳ 2", start: "2027-01-11", end: "2027-05-31" },
];
const WEEK1 = { weekNo: 1, start: "2026-09-07", end: "2026-09-12" };

// Sessions and periods. The workbook footer only pins period-1 start times
// (07:00 / 13:00); period boundaries follow the 45-minute lesson + 5-minute
// break pattern implied by the prompt (07:00, 07:50, 08:40, 09:30) and are
// editable configuration. Morning has 5 period slots because Friday grades
// 8–9 use a 5th morning period (fixture finding PERIOD_INFERRED).
const SESSIONS: {
  code: string;
  labelVi: string;
  orderNo: number;
  firstPeriodStart: string;
  periods: { orderNo: number; start: string; end: string }[];
}[] = [
  {
    code: "MORNING",
    labelVi: "Sáng",
    orderNo: 1,
    firstPeriodStart: "07:00",
    periods: [
      { orderNo: 1, start: "07:00", end: "07:45" },
      { orderNo: 2, start: "07:50", end: "08:35" },
      { orderNo: 3, start: "08:40", end: "09:25" },
      { orderNo: 4, start: "09:30", end: "10:15" },
      { orderNo: 5, start: "10:20", end: "11:05" },
    ],
  },
  {
    code: "AFTERNOON",
    labelVi: "Chiều",
    orderNo: 2,
    firstPeriodStart: "13:00",
    periods: [
      { orderNo: 1, start: "13:00", end: "13:45" },
      { orderNo: 2, start: "13:50", end: "14:35" },
      { orderNo: 3, start: "14:40", end: "15:25" },
    ],
  },
];

// PCPN "Tổ" column values (VP/TN/XH/NK) with standard organizational names.
const DEPARTMENTS = [
  { code: "VP", name: "Văn phòng" },
  { code: "TN", name: "Tổ Toán - Tự nhiên" },
  { code: "XH", name: "Tổ Ngữ văn - Xã hội" },
  { code: "NK", name: "Tổ Năng khiếu" },
];

// Subject catalog with components: one subject ≠ one teacher (fixture fact).
const SUBJECTS: {
  code: string;
  name: string;
  components?: { code: string; name: string }[];
}[] = [
  { code: "MATHEMATICS", name: "Toán" },
  { code: "LITERATURE", name: "Ngữ văn" },
  { code: "ENGLISH", name: "Tiếng Anh" },
  { code: "INFORMATICS", name: "Tin học" },
  { code: "PHYSICAL_EDUCATION", name: "Giáo dục thể chất" },
  { code: "CIVIC_EDUCATION", name: "Giáo dục công dân" },
  { code: "LOCAL_EDUCATION", name: "Giáo dục địa phương" },
  { code: "EXPERIENTIAL_CAREER", name: "Hoạt động trải nghiệm - hướng nghiệp" },
  { code: "TECHNOLOGY", name: "Công nghệ" },
  {
    code: "NATURAL_SCIENCE",
    name: "Khoa học tự nhiên",
    components: [
      { code: "PHYSICS", name: "Lý" },
      { code: "CHEMISTRY", name: "Hoá" },
      { code: "BIOLOGY", name: "Sinh" },
    ],
  },
  {
    code: "HISTORY_GEOGRAPHY",
    name: "Lịch sử & Địa lí",
    components: [
      { code: "HISTORY", name: "Lịch sử" },
      { code: "GEOGRAPHY", name: "Địa lí" },
    ],
  },
  {
    code: "ARTS",
    name: "Nghệ thuật",
    components: [
      { code: "MUSIC", name: "Âm nhạc" },
      { code: "VISUAL_ARTS", name: "Mĩ thuật" },
    ],
  },
];

// Fixture entry subjectCode → (subject, component). The fixture flattens
// subject+component into one code (NS_PHYSICS, HG_HISTORY, ARTS_MUSIC, …);
// the mapping is explicit so a catalog rename cannot silently corrupt it.
const ENTRY_SUBJECT: Record<string, { subject: string; component?: string }> = {
  MATHEMATICS: { subject: "MATHEMATICS" },
  LITERATURE: { subject: "LITERATURE" },
  ENGLISH: { subject: "ENGLISH" },
  INFORMATICS: { subject: "INFORMATICS" },
  PHYSICAL_EDUCATION: { subject: "PHYSICAL_EDUCATION" },
  CIVIC_EDUCATION: { subject: "CIVIC_EDUCATION" },
  LOCAL_EDUCATION: { subject: "LOCAL_EDUCATION" },
  EXPERIENTIAL_CAREER: { subject: "EXPERIENTIAL_CAREER" },
  TECHNOLOGY: { subject: "TECHNOLOGY" },
  NS_PHYSICS: { subject: "NATURAL_SCIENCE", component: "PHYSICS" },
  NS_CHEMISTRY: { subject: "NATURAL_SCIENCE", component: "CHEMISTRY" },
  NS_BIOLOGY: { subject: "NATURAL_SCIENCE", component: "BIOLOGY" },
  HG_HISTORY: { subject: "HISTORY_GEOGRAPHY", component: "HISTORY" },
  HG_GEOGRAPHY: { subject: "HISTORY_GEOGRAPHY", component: "GEOGRAPHY" },
  ARTS_MUSIC: { subject: "ARTS", component: "MUSIC" },
  ARTS_VISUAL: { subject: "ARTS", component: "VISUAL_ARTS" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UTC midnight Date for @db.Date columns (avoids timezone drift). */
function date(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** ISO weekday (Mon=1 … Sun=7) of an ISO date string. */
function isoWeekday(iso: string): number {
  const d = date(iso).getUTCDay(); // 0=Sun … 6=Sat
  return d === 0 ? 7 : d;
}

/**
 * Vietnamese day-off label ("Thứ 5") → ISO weekday (Mon=1 … Sun=7).
 * Vietnamese convention: Thứ 2 = Monday, so ISO = N − 1.
 */
function dayOffToIsoWeekday(label: string): number | null {
  const m = label.match(/Thứ\s*(\d)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 2 && n <= 8 ? ((n - 1 - 1 + 7) % 7) + 1 : null;
}

/** Extract a class code ("8A") from a PCPN duty string like "Chủ nhiệm 8A". */
function homeroomClassOf(dutyItems: string[]): string | null {
  for (const item of dutyItems) {
    const m = item.match(/Chủ nhiệm\s*(?:lớp\s*)?(\d[AB])/i);
    if (m) return m[1];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (copy .env or export it)");
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    await prisma.$transaction(
      async (tx) => {
        // ---- wipe (FK-safe child-first order) ----
        await tx.auditLog.deleteMany();
        await tx.notificationRecipient.deleteMany();
        await tx.notification.deleteMany();
        await tx.makeupLesson.deleteMany();
        await tx.substitution.deleteMany();
        await tx.timetableEntry.deleteMany();
        await tx.timetableVersion.deleteMany();
        await tx.teachingRequirement.deleteMany();
        await tx.teachingAssignment.deleteMany();
        await tx.teacherAvailability.deleteMany();
        await tx.teacherAlias.deleteMany();
        await tx.workloadPolicy.deleteMany();
        await tx.academicDay.deleteMany();
        await tx.week.deleteMany();
        await tx.period.deleteMany();
        await tx.sessionConfig.deleteMany();
        await tx.studentClassMembership.deleteMany();
        await tx.student.deleteMany();
        await tx.class.deleteMany();
        await tx.subjectComponent.deleteMany();
        await tx.subject.deleteMany();
        await tx.room.deleteMany();
        await tx.teacher.deleteMany();
        await tx.department.deleteMany();
        await tx.authSession.deleteMany();
        await tx.user.deleteMany();
        await tx.holiday.deleteMany();
        await tx.specialEvent.deleteMany();
        await tx.semester.deleteMany();
        await tx.schoolYear.deleteMany();
        await tx.school.deleteMany();

        // ---- organization & calendar ----
        const school = await tx.school.create({
          data: {
            code: SCHOOL.code,
            name: SCHOOL.name,
            division: SCHOOL.division,
            timezone: SCHOOL.timezone,
          },
        });

        const schoolYear = await tx.schoolYear.create({
          data: {
            schoolId: school.id,
            name: YEAR.name,
            startDate: date(YEAR.start),
            endDate: date(YEAR.end),
            status: "ACTIVE",
          },
        });

        const semester = await tx.semester.create({
          data: {
            schoolYearId: schoolYear.id,
            name: SEMESTERS[0].name,
            startDate: date(SEMESTERS[0].start),
            endDate: date(SEMESTERS[0].end),
          },
        });
        await tx.semester.create({
          data: {
            schoolYearId: schoolYear.id,
            name: SEMESTERS[1].name,
            startDate: date(SEMESTERS[1].start),
            endDate: date(SEMESTERS[1].end),
          },
        });

        const week = await tx.week.create({
          data: {
            semesterId: semester.id,
            schoolYearId: schoolYear.id,
            weekNo: WEEK1.weekNo,
            startDate: date(WEEK1.start),
            endDate: date(WEEK1.end),
            status: "ACTIVE",
          },
        });

        // Academic days derived from the fixture's distinct entry dates
        // (Mon 2026-09-07 … Sat 2026-09-12 — Saturday is a school day).
        const dayByDate = new Map<string, string>();
        for (const iso of [...new Set(fixtureEntries.map((e) => e.date))].sort()) {
          const day = await tx.academicDay.create({
            data: {
              weekId: week.id,
              date: date(iso),
              dayOfWeek: isoWeekday(iso),
              isSchoolDay: true,
            },
          });
          dayByDate.set(iso, day.id);
        }

        // ---- sessions & periods ----
        const periodBySessionOrder = new Map<string, string>();
        for (const s of SESSIONS) {
          const session = await tx.sessionConfig.create({
            data: {
              schoolYearId: schoolYear.id,
              code: s.code,
              labelVi: s.labelVi,
              orderNo: s.orderNo,
              firstPeriodStart: s.firstPeriodStart,
            },
          });
          for (const p of s.periods) {
            const period = await tx.period.create({
              data: {
                schoolYearId: schoolYear.id,
                sessionId: session.id,
                orderNo: p.orderNo,
                startTime: p.start,
                endTime: p.end,
                labelVi: `Tiết ${p.orderNo}`,
              },
            });
            periodBySessionOrder.set(`${s.code}#${p.orderNo}`, period.id);
          }
        }

        // ---- departments & teachers ----
        const departmentByCode = new Map<string, string>();
        for (const dep of DEPARTMENTS) {
          const created = await tx.department.create({
            data: { schoolId: school.id, code: dep.code, name: dep.name },
          });
          departmentByCode.set(dep.code, created.id);
        }

        const teacherByName = new Map<string, string>();
        for (const t of fixtureTeachers) {
          const fullName = normalizeName(t.fullName);
          const teacher = await tx.teacher.create({
            data: {
              schoolId: school.id,
              code: `T${String(t.orderNo).padStart(2, "0")}`,
              fullName,
              specialty: t.specialty,
              position: t.position,
              departmentId: t.department
                ? departmentByCode.get(t.department) ?? null
                : null,
            },
          });
          teacherByName.set(fullName, teacher.id);
        }

        // TKB aliases (labels only — stable identity is teacher.code).
        const aliasRows: { teacherId: string; alias: string }[] = [];
        for (const [alias, fullName] of Object.entries(aliasesFixture.aliases)) {
          const teacherId = teacherByName.get(normalizeName(fullName));
          if (!teacherId) {
            throw new Error(`Alias "${alias}" points to unknown teacher "${fullName}"`);
          }
          aliasRows.push({ teacherId, alias });
        }
        await tx.teacherAlias.createMany({
          data: aliasRows.filter(
            (row, i) =>
              aliasRows.findIndex(
                (r) => r.teacherId === row.teacherId && r.alias === row.alias,
              ) === i,
          ),
        });

        // Day-off availability (Thứ N → ISO weekday). Seeded as data; the
        // documented source conflict (Trần Anh Khoa teaches on his Thứ 5 day
        // off) remains and must be flagged by the conflict engine — that is
        // deliberate regression material.
        const availabilityRows: {
          schoolYearId: string;
          teacherId: string;
          dayOfWeek: number;
          status: string;
        }[] = [];
        for (const t of fixtureTeachers) {
          if (!t.dayOff) continue;
          const dayOfWeek = dayOffToIsoWeekday(t.dayOff);
          if (dayOfWeek == null) continue;
          const teacherId = teacherByName.get(normalizeName(t.fullName));
          if (!teacherId) continue;
          availabilityRows.push({
            schoolYearId: schoolYear.id,
            teacherId,
            dayOfWeek,
            status: "UNAVAILABLE",
          });
        }
        await tx.teacherAvailability.createMany({ data: availabilityRows });

        // ---- subjects & components ----
        const subjectByCode = new Map<string, string>();
        const componentBySubjectCode = new Map<string, string>();
        for (const s of SUBJECTS) {
          const subject = await tx.subject.create({
            data: { schoolId: school.id, code: s.code, name: s.name },
          });
          subjectByCode.set(s.code, subject.id);
          for (const c of s.components ?? []) {
            const component = await tx.subjectComponent.create({
              data: {
                subjectId: subject.id,
                code: c.code,
                name: c.name,
              },
            });
            componentBySubjectCode.set(`${s.code}#${c.code}`, component.id);
          }
        }

        // ---- classes (homeroom parsed from PCPN duties) ----
        const classByCode = new Map<string, string>();
        for (const code of entriesFixture.classes as string[]) {
          const homeroom = fixtureTeachers.find((t) => {
            const cls = homeroomClassOf(t.duties.items);
            return cls === code;
          });
          const created = await tx.class.create({
            data: {
              schoolId: school.id,
              schoolYearId: schoolYear.id,
              code,
              grade: Number(code.charAt(0)),
              homeroomTeacherId: homeroom
                ? teacherByName.get(normalizeName(homeroom.fullName))
                : null,
            },
          });
          classByCode.set(code, created.id);
        }

        // ---- workload policies (from PCPN "Số tiết so với QĐ/Tuần") ----
        const policySeen = new Set<string>();
        for (const t of fixtureTeachers) {
          if (!t.position || t.standardWeekly == null) continue;
          const key = `${t.position}|${t.standardWeekly}`;
          if (policySeen.has(key)) continue;
          policySeen.add(key);
          await tx.workloadPolicy.create({
            data: {
              schoolYearId: schoolYear.id,
              position: t.position,
              weeklyQuota: t.standardWeekly,
            },
          });
        }

        // ---- teaching assignments (expected workload) ----
        // TEACHING rows come from the verified TKB coverage (class × subject ×
        // teacher → lessons/week); for this fixture expected == scheduled for
        // every teacher (summary.json reconciles all 19). PCPN raw strings are
        // preserved in sourceRaw for traceability.
        const coverage = new Map<
          string,
          { classCode: string; subjectCode: string; teacherName: string; count: number }
        >();
        for (const e of fixtureEntries) {
          const key = `${e.classCode}|${e.subjectCode}|${normalizeName(e.teacherName)}`;
          const found = coverage.get(key);
          if (found) found.count += 1;
          else
            coverage.set(key, {
              classCode: e.classCode,
              subjectCode: e.subjectCode,
              teacherName: normalizeName(e.teacherName),
              count: 1,
            });
        }

        const assignmentRows: {
          schoolYearId: string;
          teacherId: string;
          classId: string | null;
          subjectId: string | null;
          subjectComponentId: string | null;
          lessonsPerWeek: number;
          assignmentType: string;
          notes: string | null;
          sourceRaw: string | null;
        }[] = [];

        for (const t of fixtureTeachers) {
          const teacherId = teacherByName.get(normalizeName(t.fullName));
          if (!teacherId) continue;
          const raw =
            t.teaching.subjectClasses && t.teaching.lessonsPerUnit
              ? `${t.teaching.subjectClasses} (${t.teaching.lessonsPerUnit})`
              : null;

          for (const c of coverage.values()) {
            if (c.teacherName !== normalizeName(t.fullName)) continue;
            const mapped = ENTRY_SUBJECT[c.subjectCode];
            if (!mapped) {
              throw new Error(`Unknown fixture subjectCode "${c.subjectCode}"`);
            }
            assignmentRows.push({
              schoolYearId: schoolYear.id,
              teacherId,
              classId: classByCode.get(c.classCode) ?? null,
              subjectId: subjectByCode.get(mapped.subject) ?? null,
              subjectComponentId: mapped.component
                ? componentBySubjectCode.get(`${mapped.subject}#${mapped.component}`) ?? null
                : null,
              lessonsPerWeek: c.count,
              assignmentType: "TEACHING",
              notes: null,
              sourceRaw: raw,
            });
          }

          // Duty assignment (one combined row per teacher — the source does
          // not break lesson equivalents down per duty item).
          if (t.duties.raw) {
            assignmentRows.push({
              schoolYearId: schoolYear.id,
              teacherId,
              classId: null,
              subjectId: null,
              subjectComponentId: null,
              lessonsPerWeek: t.duties.lessons ?? 0,
              assignmentType: "DUTY",
              notes: t.duties.items.join("; "),
              sourceRaw: t.duties.raw,
            });
          }

          // Gifted-student coaching (BDHSG): real expected work, but the
          // source gives no lesson count — kept with 0 lessons, raw preserved.
          if (t.extraTeaching.raw) {
            assignmentRows.push({
              schoolYearId: schoolYear.id,
              teacherId,
              classId: null,
              subjectId: null,
              subjectComponentId: null,
              lessonsPerWeek: t.extraTeaching.lessons ?? 0,
              assignmentType: "DUTY",
              notes: t.extraTeaching.raw,
              sourceRaw: t.extraTeaching.raw,
            });
          }
        }
        await tx.teachingAssignment.createMany({ data: assignmentRows });

        // ---- published week-1 timetable version ----
        const now = new Date();
        const version = await tx.timetableVersion.create({
          data: {
            weekId: week.id,
            versionNo: 1,
            status: "PUBLISHED",
            name: "Tuần 1 · bản gốc (seed từ week1_schedule.xls)",
            createdBy: "seed",
            submittedBy: "seed",
            approvedBy: "seed",
            publishedBy: "seed",
            submittedAt: now,
            approvedAt: now,
            publishedAt: now,
          },
        });

        const entryRows = fixtureEntries.map((e) => {
          const dayId = dayByDate.get(e.date);
          if (!dayId) throw new Error(`No academic day for date ${e.date}`);
          const periodId = periodBySessionOrder.get(`${e.session}#${e.period}`);
          if (!periodId) {
            throw new Error(
              `No period configured for ${e.session} period ${e.period} (entry ${e.classCode} ${e.subjectCode})`,
            );
          }
          const teacherId = teacherByName.get(normalizeName(e.teacherName));
          if (!teacherId) throw new Error(`Unknown teacher "${e.teacherName}"`);
          const classId = classByCode.get(e.classCode);
          if (!classId) throw new Error(`Unknown class "${e.classCode}"`);
          const mapped = ENTRY_SUBJECT[e.subjectCode];
          if (!mapped) throw new Error(`Unknown fixture subjectCode "${e.subjectCode}"`);
          const subjectId = subjectByCode.get(mapped.subject);
          if (!subjectId) throw new Error(`Unknown subject "${mapped.subject}"`);
          return {
            versionId: version.id,
            academicDayId: dayId,
            periodId,
            classId,
            subjectId,
            subjectComponentId: mapped.component
              ? componentBySubjectCode.get(`${mapped.subject}#${mapped.component}`) ?? null
              : null,
            teacherId,
            status: "NORMAL",
            notes: e.periodInferred
              ? "Tiết 5 sáng thứ 6 được suy luận từ layout nguồn (dòng Excel không đánh số tiết)"
              : null,
            sourceRow: e.sourceRow,
          };
        });
        await tx.timetableEntry.createMany({ data: entryRows });

        // ---- demo users (auth) ----
        // Dev-only accounts. Production MUST change every password before
        // first login (SEED_DEV_PASSWORD env var overrides at seed time).
        const devPassword = process.env.SEED_DEV_PASSWORD ?? "Dev@12345";
        const passwordHash = hashPassword(devPassword);

        const admin = await tx.user.create({
          data: {
            schoolId: school.id,
            username: "admin",
            passwordHash,
            displayName: "Quản trị hệ thống",
            role: "SUPER_ADMIN",
          },
        });
        await tx.user.create({
          data: {
            schoolId: school.id,
            username: "tkbadmin",
            passwordHash,
            displayName: "Cán bộ xếp thời khóa biểu",
            role: "TIMETABLE_ADMIN",
          },
        });
        const principalTeacher = teacherByName.get(normalizeName("Nguyễn Viết Trung"));
        if (principalTeacher) {
          const principalUser = await tx.user.create({
            data: {
              schoolId: school.id,
              username: "principal",
              passwordHash,
              displayName: "Hiệu trưởng — Nguyễn Viết Trung",
              role: "PRINCIPAL",
            },
          });
          await tx.teacher.update({
            where: { id: principalTeacher },
            data: { userId: principalUser.id },
          });
        }
        // Teacher accounts: username = teacher.code (T01..T19) lowercased;
        // User→Teacher links are set on Teacher.userId (the FK side).
        for (const t of fixtureTeachers) {
          const teacherId = teacherByName.get(normalizeName(t.fullName));
          if (!teacherId) continue;
          const teacherUser = await tx.user.create({
            data: {
              schoolId: school.id,
              username: `T${String(t.orderNo).padStart(2, "0")}`.toLowerCase(),
              passwordHash,
              displayName: t.fullName,
              role: "TEACHER",
            },
          });
          await tx.teacher.update({
            where: { id: teacherId },
            data: { userId: teacherUser.id },
          });
        }

        await tx.auditLog.create({
          data: {
            actorName: "seed",
            action: "CREATE",
            entityType: "User",
            entityId: admin.id,
            after: { note: "demo users seeded (admin, tkbadmin, principal, 19 teachers)" },
            reason: "Seed demo accounts for development",
          },
        });

        // ---- audit trail for the seed import & publish ----
        await tx.auditLog.createMany({
          data: [
            {
              actorName: "seed",
              action: "IMPORT",
              entityType: "TimetableVersion",
              entityId: version.id,
              after: {
                source: "database/fixtures/week1 (week1_schedule.xls)",
                entries: entryRows.length,
                teachers: fixtureTeachers.length,
                classes: (entriesFixture.classes as string[]).length,
              },
              reason: "Seed Week 01 fixture",
            },
            {
              actorName: "seed",
              action: "PUBLISH",
              entityType: "TimetableVersion",
              entityId: version.id,
              after: { status: "PUBLISHED", versionNo: 1 },
              reason: "Seed Week 01 fixture as published baseline",
            },
          ],
        });
      },
      { timeout: 120_000 },
    );

    await verify(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Post-seed verification against database/fixtures/week1/summary.json
// ---------------------------------------------------------------------------

async function verify(prisma: PrismaClient): Promise<void> {
  const summary = summaryFixture as {
    teacherCount: number;
    classCount: number;
    entryCount: number;
    perTeacher: {
      fullName: string;
      pcpnTeachingTotal: number;
      tkbScheduledCount: number;
    }[];
  };

  const failures: string[] = [];

  const [entryCount, teacherCount, classCount] = await Promise.all([
    prisma.timetableEntry.count(),
    prisma.teacher.count(),
    prisma.class.count(),
  ]);
  if (entryCount !== summary.entryCount)
    failures.push(`entry count ${entryCount} != ${summary.entryCount}`);
  if (teacherCount !== summary.teacherCount)
    failures.push(`teacher count ${teacherCount} != ${summary.teacherCount}`);
  if (classCount !== summary.classCount)
    failures.push(`class count ${classCount} != ${summary.classCount}`);

  const scheduled = await prisma.timetableEntry.groupBy({
    by: ["teacherId"],
    _count: { _all: true },
  });
  const expectedAssignments = await prisma.teachingAssignment.groupBy({
    by: ["teacherId"],
    where: { assignmentType: "TEACHING" },
    _sum: { lessonsPerWeek: true },
  });
  const teachers = await prisma.teacher.findMany();
  const scheduledByTeacher = new Map(scheduled.map((r) => [r.teacherId, r._count._all]));
  const assignedByTeacher = new Map(
    expectedAssignments.map((r) => [r.teacherId, r._sum.lessonsPerWeek ?? 0]),
  );

  console.log(
    "\nTeacher reconciliation (expected = TEACHING assignments, scheduled = published entries):",
  );
  for (const t of teachers) {
    const row = summary.perTeacher.find(
      (p) => normalizeName(p.fullName) === normalizeName(t.fullName),
    );
    if (!row) {
      failures.push(`teacher ${t.fullName} missing from summary fixture`);
      continue;
    }
    const scheduledCount = scheduledByTeacher.get(t.id) ?? 0;
    const assigned = assignedByTeacher.get(t.id) ?? 0;
    const okExpected = assigned === row.pcpnTeachingTotal;
    const okScheduled = scheduledCount === row.tkbScheduledCount;
    if (!okExpected)
      failures.push(
        `${t.fullName}: assignment lessons ${assigned} != PCPN ${row.pcpnTeachingTotal}`,
      );
    if (!okScheduled)
      failures.push(
        `${t.fullName}: scheduled ${scheduledCount} != TKB ${row.tkbScheduledCount}`,
      );
    console.log(
      `  ${okExpected && okScheduled ? "OK " : "!!"} ${t.fullName.padEnd(24)} expected ${String(
        assigned,
      ).padStart(2)}/${String(row.pcpnTeachingTotal).padStart(2)}  scheduled ${String(
        scheduledCount,
      ).padStart(2)}/${String(row.tkbScheduledCount).padStart(2)}`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`Seed verification failed:\n  - ${failures.join("\n  - ")}`);
  }

  const userCount = await prisma.user.count();
  console.log(
    `\nSeed OK: ${teacherCount} teachers, ${classCount} classes, ${entryCount} entries, ` +
      `${userCount} demo users (admin / tkbadmin / principal / t01–t19, ` +
      `dev password "${process.env.SEED_DEV_PASSWORD ?? "Dev@12345"}" — CHANGE IN PRODUCTION), ` +
      `all per-teacher totals reconcile with the Week 01 fixture.`,
  );
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
