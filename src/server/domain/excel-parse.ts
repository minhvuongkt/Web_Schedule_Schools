/**
 * Pure Excel TKB parsing and mapping (no Prisma/DB imports — unit-testable
 * with synthetic grids and the real week1_schedule.xls workbook).
 *
 * Sheet layout (verified against database/fixtures/week1/tkb-sheet.json):
 * - Title rows contain the declared date range
 *   "(Áp dụng từ ngày 07 tháng 9 năm 2026 đến ngày 11 tháng 9 năm 2026)".
 * - A header row lists class columns ("Lớp 6A" …), each class owning a pair
 *   of columns: "Môn" (subject) then "GV thực hiên" (teacher alias — the
 *   header itself contains the documented LABEL_TYPO).
 * - Day blocks start at rows whose first cell is "Thứ N"; the session cell
 *   ("S"/"Sáng" = morning, "C"/"Chiều" = afternoon) appears on the first
 *   row of each session; the period number sits in the "Tiết" column.
 * - A lesson row without a period number (the Friday 5th morning period)
 *   is inferred as previous+1 and flagged PERIOD_INFERRED.
 * - Footer rows (signature "HIỆU TRƯỞNG", place "Măng Đen", period-start
 *   notes) and the signature name row (GV cell without a Môn cell) are
 *   skipped.
 *
 * Issue types surfaced here (documented findings in the fixture README):
 * PERIOD_INFERRED, DATE_RANGE_MISMATCH, LABEL_TYPO, MISSING_DATE_RANGE,
 * MISSING_CLASS_HEADER, ORPHAN_ROW, PERIOD_MISSING and the mapping issues
 * UNKNOWN_CLASS / UNKNOWN_SUBJECT / UNKNOWN_TEACHER / MISSING_TEACHER.
 */
import * as XLSX from "xlsx";
import { diacriticFreeKey, normalizeName } from "./normalize";

export type SessionCode = "MORNING" | "AFTERNOON";

export interface ParsedTkbEntry {
  dayLabel: string; // "Thứ 2"
  dateIso: string | null; // derived from the declared title range
  sessionCode: SessionCode;
  periodNo: number;
  periodInferred: boolean;
  classCode: string;
  subjectLabel: string; // raw "Môn" cell
  teacherAlias: string; // raw "GV" cell ("" when empty)
  sourceRow: number; // 1-based Excel row (grid index + 1)
}

export interface ImportIssue {
  type: string;
  severity: "ERROR" | "WARNING";
  message: string;
  details?: Record<string, unknown>;
}

export interface ParseResult {
  entries: ParsedTkbEntry[];
  issues: ImportIssue[];
  /** Date range declared in the sheet title, when readable. */
  declaredRange?: { start: string; end: string } | null;
}

// ---------------------------------------------------------------------------
// Label-index helpers (Excel labels are never IDs — see AGENTS.md)
// ---------------------------------------------------------------------------

export interface ClassRef {
  id: string;
  code: string;
}

export interface TeacherRef {
  id: string;
  code: string;
  fullName: string;
}

export interface SubjectRef {
  subjectId: string;
  subjectComponentId: string | null;
}

export interface TkbMapContext {
  /** keyed by class code (use insertLabel to populate). */
  classesByCode: Map<string, ClassRef>;
  /** keyed by alias/fullName/shortName variants (use insertLabel). */
  teachersByAlias: Map<string, TeacherRef>;
  /** keyed by subject labels (use insertLabel). */
  subjectsByLabel: Map<string, SubjectRef>;
  /** Human-readable labels used for "did you mean…" suggestions on lookup
   *  failures (real catalog names, not the lookup variants). */
  classDisplayLabels?: string[];
  teacherDisplayLabels?: string[];
  subjectDisplayLabels?: string[];
}

/**
 * Lookup variants for an Excel label: canonical (apostrophes folded,
 * whitespace collapsed), period-adjacent spaces collapsed, all spaces
 * removed, and case/diacritic-insensitive. "C. Tâm", "C.Tâm" and "C.tam"
 * all resolve through these.
 */
export function labelVariants(label: string): string[] {
  const base = normalizeName(label);
  const collapsed = base.replace(/\s*\.\s*/g, ".");
  const squeezed = base.replace(/\s+/g, "");
  const keys = [base, collapsed, squeezed, diacriticFreeKey(label)];
  return [...new Set(keys.filter((key) => key !== ""))];
}

/** Inserts a label under all its variants (first writer wins on collision). */
export function insertLabel<T>(map: Map<string, T>, label: string, value: T): void {
  for (const key of labelVariants(label)) {
    if (!map.has(key)) map.set(key, value);
  }
}

function lookupLabel<T>(map: Map<string, T>, label: string): T | undefined {
  for (const key of labelVariants(label)) {
    const hit = map.get(key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// "Did you mean…?" suggestions for failed lookups
// ---------------------------------------------------------------------------

/** Levenshtein distance (small strings only — catalog labels are short). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j]! + 1,
        curr[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n]!;
}

/**
 * Similarity score 0–100 between an unknown Excel label and a catalog label:
 * diacritic-free containment (partial names like "Nguyễn Vân" → "Nguyễn Thị
 * Vân") beats token overlap ("nguyen thi" → shared 2/3 tokens) beats edit
 * distance (typos like "Toám" → "Toán"). Returns 0 for nothing recognisable.
 */
function labelSimilarity(unknown: string, candidate: string): number {
  const u = diacriticFreeKey(unknown);
  const c = diacriticFreeKey(candidate);
  if (u === "" || c === "") return 0;
  if (u === c) return 100;
  if (c.includes(u) || u.includes(c)) return 90;
  const uTokens = new Set(u.split(/\s+/));
  const cTokens = c.split(/\s+/);
  const shared = cTokens.filter((token) => uTokens.has(token)).length;
  const overlap = shared / Math.max(uTokens.size, cTokens.length);
  const editSim = 1 - editDistance(u, c) / Math.max(u.length, c.length);
  return Math.max(overlap * 85, editSim * 80);
}

/** Up to `limit` closest catalog labels for a failed lookup (score ≥ 50). */
export function suggestLabels(
  unknown: string,
  candidates: readonly string[] | undefined,
  limit = 3,
): string[] {
  if (!candidates || candidates.length === 0 || unknown.trim() === "") return [];
  const seen = new Set<string>();
  const scored: { label: string; score: number }[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const score = labelSimilarity(unknown, candidate);
    if (score >= 50) scored.push({ label: candidate, score });
  }
  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return scored.slice(0, limit).map((s) => s.label);
}

// ---------------------------------------------------------------------------
// Duplicate-slot detection (same class/day/session/period twice in one file)
// ---------------------------------------------------------------------------

export interface DuplicateSlotGroup {
  classId: string;
  dateIso: string;
  sessionCode: SessionCode;
  periodNo: number;
  sourceRows: number[];
}

/** Groups mapped entries that land on the same class+day+session+period. */
export function findDuplicateSlots(
  mapped: readonly { classId: string; dateIso: string | null; sessionCode: SessionCode; periodNo: number; sourceRow: number }[],
): DuplicateSlotGroup[] {
  const bySlot = new Map<string, DuplicateSlotGroup>();
  for (const entry of mapped) {
    if (entry.dateIso === null) continue;
    const key = `${entry.classId}#${entry.dateIso}#${entry.sessionCode}#${entry.periodNo}`;
    const group = bySlot.get(key);
    if (group) group.sourceRows.push(entry.sourceRow);
    else
      bySlot.set(key, {
        classId: entry.classId,
        dateIso: entry.dateIso,
        sessionCode: entry.sessionCode,
        periodNo: entry.periodNo,
        sourceRows: [entry.sourceRow],
      });
  }
  return [...bySlot.values()].filter((group) => group.sourceRows.length > 1);
}

// ---------------------------------------------------------------------------
// Sheet → grid
// ---------------------------------------------------------------------------

function sheetToGrid(sheet: XLSX.WorkSheet): string[][] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: null,
    raw: false,
  });
  return rows.map((row) =>
    (row ?? []).map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim())),
  );
}

// ---------------------------------------------------------------------------
// Date helpers (UTC math — ISO strings only, never local Date parsing)
// ---------------------------------------------------------------------------

const RANGE_RE =
  /từ\s+ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})\s+đến\s+ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i;

function isoFromParts(day: number, month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** ISO weekday (Mon=1 … Sun=7) of an ISO date string. */
export function isoWeekdayOf(iso: string): number {
  const day = new Date(`${iso}T00:00:00.000Z`).getUTCDay(); // 0=Sun … 6=Sat
  return day === 0 ? 7 : day;
}

// ---------------------------------------------------------------------------
// Row classification
// ---------------------------------------------------------------------------

const DAY_LABEL_RE = /^Thứ\s*(\d)$/;

/** "Thứ N" → ISO weekday (Thứ 2 = Mon = 1 … Thứ 7 = Sat = 6, Thứ 8 = Sun). */
function dayLabelToIsoWeekday(label: string): number | null {
  const match = DAY_LABEL_RE.exec(label);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 2 && n <= 8 ? n - 1 : null;
}

function sessionOf(label: string): SessionCode | null {
  const trimmed = label.trim();
  if (trimmed === "") return null;
  const key = diacriticFreeKey(trimmed);
  if (trimmed === "S" || key === "sang") return "MORNING";
  if (trimmed === "C" || key === "chieu") return "AFTERNOON";
  return null;
}

/** Footer markers that must never be parsed as lessons (fixture finding #7). */
const FOOTER_MARKERS = ["HIỆU TRƯỞNG", "Măng Đen", "Buổi sáng tiết", "Buổi chiều tiết"];

function isFooterRow(cells: string[]): boolean {
  return FOOTER_MARKERS.some((marker) => cells.some((cell) => cell.includes(marker)));
}

// ---------------------------------------------------------------------------
// parseTkbSheet
// ---------------------------------------------------------------------------

export function parseTkbSheet(sheet: XLSX.WorkSheet): ParseResult {
  const grid = sheetToGrid(sheet);
  const issues: ImportIssue[] = [];

  // Declared date range from the title (first matching cell, top-down).
  let declaredStart: string | null = null;
  let declaredEnd: string | null = null;
  scan: for (const row of grid) {
    for (const cell of row) {
      const match = RANGE_RE.exec(cell);
      if (match) {
        declaredStart = isoFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
        declaredEnd = isoFromParts(Number(match[4]), Number(match[5]), Number(match[6]));
        break scan;
      }
    }
  }
  if (!declaredStart || !declaredEnd) {
    issues.push({
      type: "MISSING_DATE_RANGE",
      severity: "ERROR",
      message:
        "Không đọc được khoảng ngày áp dụng từ tiêu đề trang tính — không thể suy ra ngày học của các tiết.",
    });
  }
  const declaredRange =
    declaredStart && declaredEnd ? { start: declaredStart, end: declaredEnd } : null;

  // Class header row: the row with the most "Lớp <code>" cells.
  let headerRowIndex = -1;
  let classCols: { monCol: number; code: string }[] = [];
  let bestCount = 0;
  grid.forEach((row, index) => {
    const found: { monCol: number; code: string }[] = [];
    row.forEach((cell, col) => {
      const match = /^Lớp\s+(.+)$/.exec(cell);
      if (match) found.push({ monCol: col, code: normalizeName(match[1]) });
    });
    if (found.length > bestCount) {
      bestCount = found.length;
      headerRowIndex = index;
      classCols = found;
    }
  });
  if (headerRowIndex < 0 || classCols.length === 0) {
    issues.push({
      type: "MISSING_CLASS_HEADER",
      severity: "ERROR",
      message: "Không tìm thấy dòng tiêu đề cột lớp ('Lớp 6A', …) trong trang tính.",
    });
    return { entries: [], issues, declaredRange };
  }

  // Documented LABEL_TYPO: the GV sub-header says "GV thực hiên".
  const subheader = grid[headerRowIndex + 1] ?? [];
  if (subheader.some((cell) => /GV\s+thực\s+hiên\b/i.test(cell))) {
    issues.push({
      type: "LABEL_TYPO",
      severity: "WARNING",
      message: "Tiêu đề cột 'GV thực hiên' sai chính tả (đúng: 'GV thực hiện') — đã bỏ qua khi phân tích.",
      details: { sourceRow: headerRowIndex + 2 },
    });
  }

  const entries: ParsedTkbEntry[] = [];
  let currentDay: { label: string; isoWeekday: number } | null = null;
  let currentSession: SessionCode | null = null;
  let currentPeriod: number | null = null;
  let sawFooterPlace = false;

  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const row = grid[r];
    const sourceRow = r + 1; // 1-based Excel row for traceability

    if (row.every((cell) => cell === "")) continue;
    if (isFooterRow(row)) {
      if (row.some((cell) => cell.includes("Măng Đen"))) sawFooterPlace = true;
      continue;
    }
    // "Môn"/"GV" sub-header rows are not lessons.
    if (row.filter((cell) => cell === "Môn").length >= 2) continue;

    const dayMatch = DAY_LABEL_RE.exec(row[0] ?? "");
    if (dayMatch) {
      const isoWeekday = dayLabelToIsoWeekday(row[0]);
      if (isoWeekday !== null) {
        currentDay = { label: normalizeName(row[0]), isoWeekday };
        currentSession = null;
        currentPeriod = null;
      }
    }
    const session = sessionOf(row[1] ?? "");
    if (session !== null) {
      currentSession = session;
      currentPeriod = null;
    }
    const explicitPeriod = /^\d+$/.test(row[2] ?? "") ? Number(row[2]) : null;

    const filledCols = classCols.filter((cc) => (row[cc.monCol] ?? "") !== "");
    const hasSubject = filledCols.length > 0;

    let periodNo: number | null = explicitPeriod;
    let periodInferred = false;
    if (explicitPeriod === null && hasSubject) {
      if (currentDay === null || currentSession === null) {
        issues.push({
          type: "ORPHAN_ROW",
          severity: "ERROR",
          message: `Dòng ${sourceRow}: có ô môn học nhưng không xác định được ngày/buổi.`,
          details: { sourceRow },
        });
        continue;
      }
      if (currentPeriod === null) {
        issues.push({
          type: "PERIOD_MISSING",
          severity: "ERROR",
          message: `Dòng ${sourceRow} (${currentDay.label}): không có số tiết và không có tiết trước đó để suy luận.`,
          details: { sourceRow, dayLabel: currentDay.label },
        });
        continue;
      }
      periodNo = currentPeriod + 1;
      periodInferred = true;
      issues.push({
        type: "PERIOD_INFERRED",
        severity: "WARNING",
        message: `Dòng ${sourceRow} (${currentDay.label}, ${
          currentSession === "MORNING" ? "sáng" : "chiều"
        }): dòng không đánh số tiết — suy luận là tiết ${periodNo} (tiết trước + 1).`,
        details: {
          sourceRow,
          dayLabel: currentDay.label,
          sessionCode: currentSession,
          periodNo,
          classCodes: filledCols.map((cc) => cc.code),
        },
      });
    }
    if (periodNo !== null) currentPeriod = periodNo;

    if (!hasSubject) continue; // empty slot rows / GV-only footnote rows
    if (currentDay === null || currentSession === null || periodNo === null) {
      issues.push({
        type: "ORPHAN_ROW",
        severity: "ERROR",
        message: `Dòng ${sourceRow}: có ô môn học nhưng thiếu ngày/buổi/tiết.`,
        details: { sourceRow },
      });
      continue;
    }

    const dateIso = declaredStart
      ? addDaysIso(declaredStart, (currentDay.isoWeekday - isoWeekdayOf(declaredStart) + 7) % 7)
      : null;

    for (const cc of filledCols) {
      entries.push({
        dayLabel: currentDay.label,
        dateIso,
        sessionCode: currentSession,
        periodNo,
        periodInferred,
        classCode: cc.code,
        subjectLabel: row[cc.monCol] ?? "",
        teacherAlias: row[cc.monCol + 1] ?? "",
        sourceRow,
      });
    }
  }

  // Documented finding #1: lessons on dates outside the declared title range
  // (Saturday 12/09 while the title says 07–11/09). One issue per day.
  if (declaredStart && declaredEnd) {
    const byDay = new Map<string, { dayLabel: string; dateIso: string; count: number }>();
    for (const entry of entries) {
      if (!entry.dateIso) continue;
      const group = byDay.get(entry.dayLabel);
      if (group) group.count += 1;
      else byDay.set(entry.dayLabel, { dayLabel: entry.dayLabel, dateIso: entry.dateIso, count: 1 });
    }
    for (const group of byDay.values()) {
      if (group.dateIso < declaredStart || group.dateIso > declaredEnd) {
        issues.push({
          type: "DATE_RANGE_MISMATCH",
          severity: "WARNING",
          message: `${group.dayLabel} (${group.dateIso}) có ${group.count} tiết nằm ngoài khoảng ngày ghi ở tiêu đề (${declaredStart} → ${declaredEnd}).`,
          details: {
            dayLabel: group.dayLabel,
            dateIso: group.dateIso,
            declaredStart,
            declaredEnd,
            entryCount: group.count,
          },
        });
      }
    }
  }

  // Documented finding #7: footer signed at "Măng Đen" while the school name
  // says "MĂNG CÀNH".
  if (sawFooterPlace) {
    const schoolCell = grid
      .slice(0, headerRowIndex)
      .flat()
      .find((cell) => cell !== "");
    if (schoolCell && !schoolCell.toUpperCase().includes("MĂNG ĐEN")) {
      issues.push({
        type: "LABEL_TYPO",
        severity: "WARNING",
        message: `Chân trang ký tại "Măng Đen" khác địa danh trong tên trường ("${schoolCell}").`,
        details: { footerPlace: "Măng Đen", schoolName: schoolCell },
      });
    }
  }

  return { entries, issues, declaredRange };
}

export interface MappedTkbEntry {
  classId: string;
  subjectId: string;
  subjectComponentId: string | null;
  teacherId: string;
  dayLabel: string;
  dateIso: string | null;
  sessionCode: SessionCode;
  periodNo: number;
  sourceRow: number;
}

export interface UnmappedTkbEntry {
  entry: ParsedTkbEntry;
  reasons: string[]; // UNKNOWN_CLASS | UNKNOWN_SUBJECT | UNKNOWN_TEACHER | MISSING_TEACHER
  /** Closest catalog labels ("did you mean…"), per failed field:
   *  class → suggested classes, subject → suggested subjects,
   *  teacher → suggested teachers (empty when no plausible candidate). */
  suggestions?: {
    classLabels: string[];
    subjectLabels: string[];
    teacherLabels: string[];
  };
}

export interface MapResult {
  mapped: MappedTkbEntry[];
  unmapped: UnmappedTkbEntry[];
  issues: ImportIssue[];
}

export function mapEntries(parsed: ParseResult, ctx: TkbMapContext): MapResult {
  const mapped: MappedTkbEntry[] = [];
  const unmapped: UnmappedTkbEntry[] = [];
  const issues: ImportIssue[] = [];

  for (const entry of parsed.entries) {
    const reasons: string[] = [];

    const klass = lookupLabel(ctx.classesByCode, entry.classCode);
    if (!klass) {
      reasons.push("UNKNOWN_CLASS");
      issues.push({
        type: "UNKNOWN_CLASS",
        severity: "ERROR",
        message: `Dòng ${entry.sourceRow}: không tìm thấy lớp "${entry.classCode}" trong hệ thống.`,
        details: { sourceRow: entry.sourceRow, classCode: entry.classCode, subjectLabel: entry.subjectLabel },
      });
    }

    const subject = lookupLabel(ctx.subjectsByLabel, entry.subjectLabel);
    if (!subject) {
      reasons.push("UNKNOWN_SUBJECT");
      issues.push({
        type: "UNKNOWN_SUBJECT",
        severity: "ERROR",
        message: `Dòng ${entry.sourceRow}: không ánh xạ được môn "${entry.subjectLabel}" (lớp ${entry.classCode}).`,
        details: { sourceRow: entry.sourceRow, subjectLabel: entry.subjectLabel, classCode: entry.classCode },
      });
    }

    let teacher: TeacherRef | undefined;
    if (entry.teacherAlias === "") {
      reasons.push("MISSING_TEACHER");
      issues.push({
        type: "MISSING_TEACHER",
        severity: "ERROR",
        message: `Dòng ${entry.sourceRow}: tiết ${entry.subjectLabel} (lớp ${entry.classCode}) không có giáo viên trong cột GV.`,
        details: { sourceRow: entry.sourceRow, subjectLabel: entry.subjectLabel, classCode: entry.classCode },
      });
    } else {
      teacher = lookupLabel(ctx.teachersByAlias, entry.teacherAlias);
      if (!teacher) {
        reasons.push("UNKNOWN_TEACHER");
        issues.push({
          type: "UNKNOWN_TEACHER",
          severity: "ERROR",
          message: `Dòng ${entry.sourceRow}: không nhận diện được giáo viên "${entry.teacherAlias}" (lớp ${entry.classCode}, môn ${entry.subjectLabel}).`,
          details: {
            sourceRow: entry.sourceRow,
            teacherAlias: entry.teacherAlias,
            classCode: entry.classCode,
            subjectLabel: entry.subjectLabel,
          },
        });
      }
    }

    if (reasons.length > 0 || !klass || !subject || !teacher) {
      unmapped.push({
        entry,
        reasons,
        suggestions: {
          classLabels: reasons.includes("UNKNOWN_CLASS")
            ? suggestLabels(entry.classCode, ctx.classDisplayLabels)
            : [],
          subjectLabels: reasons.includes("UNKNOWN_SUBJECT")
            ? suggestLabels(entry.subjectLabel, ctx.subjectDisplayLabels)
            : [],
          teacherLabels: reasons.includes("UNKNOWN_TEACHER")
            ? suggestLabels(entry.teacherAlias, ctx.teacherDisplayLabels)
            : [],
        },
      });
      continue;
    }

    mapped.push({
      classId: klass.id,
      subjectId: subject.subjectId,
      subjectComponentId: subject.subjectComponentId,
      teacherId: teacher.id,
      dayLabel: entry.dayLabel,
      dateIso: entry.dateIso,
      sessionCode: entry.sessionCode,
      periodNo: entry.periodNo,
      sourceRow: entry.sourceRow,
    });
  }

  return { mapped, unmapped, issues };
}

// ---------------------------------------------------------------------------
// Workbook helpers
// ---------------------------------------------------------------------------

/** First sheet whose name contains "TKB" (e.g. "TKB TUẦN 1"), else null. */
export function findTkbSheet(workbook: XLSX.WorkBook): { name: string; sheet: XLSX.WorkSheet } | null {
  const name = workbook.SheetNames.find((sheetName) => sheetName.toUpperCase().includes("TKB"));
  if (!name) return null;
  return { name, sheet: workbook.Sheets[name] };
}
