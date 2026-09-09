# -*- coding: utf-8 -*-
"""
Extract structured fixture data from week1_schedule.xls into
database/fixtures/week1/.

Run with Python 3 + xlrd 2.x:
    pip install xlrd
    python scripts/extract_week1_fixture.py

Outputs:
  database/fixtures/week1/
    source/week1_schedule.xls    copy of the source workbook
    pcpn-sheet.json              raw PCPN cell grid (trimmed strings)
    tkb-sheet.json               raw TKB cell grid (trimmed strings)
    meta.json                    school, year, week, sessions, notes
    teachers.json                19 teacher records from PCPN
    subjects.json                normalized subject catalog + observed aliases
    teacher-aliases.json         TKB alias -> teacher full name (verified)
    timetable-entries.json       normalized week-1 entries + day/session layout
    summary.json                 counts + source-data validation findings

The alias and subject maps below were verified by cross-referencing the
PCPN assignment sheet against TKB entries (subject + class + lesson counts).
"""

import json
import re
import shutil
import sys
from pathlib import Path

import xlrd

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "week1_schedule.xls"
OUT = ROOT / "database" / "fixtures" / "week1"

# --------------------------------------------------------------------------
# Verified mapping tables (evidence-based, see module docstring)
# --------------------------------------------------------------------------

# TKB teacher alias -> PCPN full name.
# Keys use compact normalization (lowercase, dots/spaces removed).
TEACHER_ALIASES = {
    "tmạnh": "Lữ Đức Mạnh",
    "cnam": "Y Nam",
    "ynam": "Y Nam",
    "chằng": "Vũ Thị Hằng",
    "cvân": "Nguyễn Thị Vân",
    "cquyên": "Dương Minh Cẩm Quyên",
    "csương": "Trần Thị Sương",
    "tngọc": "Lê Xuân Ngọc",
    "cnhư": "Đỗ Thị Quỳnh Như",
    "chiền": "Nguyễn Thị Bích Hiền",
    "cphươn": "Y H'Phươn",
    "cthắm": "Đỗ Thị Hồng Thắm",
    "cđông": "Đặng Thị Tuyết Đông",
    "ctâm": "Nguyễn Thị Hoài Tâm",
    "choàitâm": "Nguyễn Thị Hoài Tâm",
    "tkhoa": "Trần Anh Khoa",
    "ttrung": "Nguyễn Viết Trung",
    "cyến": "Tạ Thị Hồng Yến",
    "cvy": "Lê Thị Vy",
    "cvinh": "Phạm Thị Vinh",
    "chiên": "Trần Thị Hiên",
}

# Display names + canonical codes for subjects.
# "component" is null for single-part subjects.
SUBJECT_CATALOG = {
    "MATHEMATICS":            {"name": "Toán", "component": None},
    "LITERATURE":             {"name": "Ngữ văn", "component": None},
    "ENGLISH":                {"name": "Tiếng Anh", "component": None},
    "INFORMATICS":            {"name": "Tin học", "component": None},
    "PHYSICAL_EDUCATION":     {"name": "Giáo dục thể chất", "component": None},
    "CIVIC_EDUCATION":        {"name": "Giáo dục công dân", "component": None},
    "LOCAL_EDUCATION":        {"name": "Giáo dục địa phương", "component": None},
    "EXPERIENTIAL_CAREER":    {"name": "Hoạt động trải nghiệm - hướng nghiệp", "component": None},
    "NS_PHYSICS":             {"name": "Khoa học tự nhiên", "component": "PHYSICS"},
    "NS_CHEMISTRY":           {"name": "Khoa học tự nhiên", "component": "CHEMISTRY"},
    "NS_BIOLOGY":             {"name": "Khoa học tự nhiên", "component": "BIOLOGY"},
    "HG_HISTORY":             {"name": "Lịch sử & Địa lí", "component": "HISTORY"},
    "HG_GEOGRAPHY":           {"name": "Lịch sử & Địa lí", "component": "GEOGRAPHY"},
    "ARTS_MUSIC":             {"name": "Nghệ thuật", "component": "MUSIC"},
    "ARTS_VISUAL":            {"name": "Nghệ thuật", "component": "VISUAL_ARTS"},
    "TECHNOLOGY":             {"name": "Công nghệ", "component": None},
}

# Observed label (normalized) -> subject code.
# NOTE: "CN" in the TKB means Công nghệ (Technology), NOT Chủ nhiệm.
# Verified: every CN entry matches the teacher assigned "CN <grade>"
# in PCPN (Quyên CN 6, Hiền CN 7, Hằng Công nghệ 8,9).
SUBJECT_LABELS = {
    "toán": "MATHEMATICS",
    "văn": "LITERATURE",
    "ngữ văn": "LITERATURE",
    "tiếng anh": "ENGLISH",
    "t.a": "ENGLISH",
    "tin": "INFORMATICS",
    "gdtc": "PHYSICAL_EDUCATION",
    "gdcd": "CIVIC_EDUCATION",
    "gdđp": "LOCAL_EDUCATION",
    "hđtn-hn": "EXPERIENTIAL_CAREER",
    "hdtnhn": "EXPERIENTIAL_CAREER",
    "khtn(l)": "NS_PHYSICS",
    "khtn(lí)": "NS_PHYSICS",
    "khtn (l)": "NS_PHYSICS",
    "khtn(h)": "NS_CHEMISTRY",
    "khtn(hoá)": "NS_CHEMISTRY",
    "khtn(s)": "NS_BIOLOGY",
    "khtn(sinh)": "NS_BIOLOGY",
    "ls&đl(ls)": "HG_HISTORY",
    "ls-đl (lịch sử)": "HG_HISTORY",
    "ls&đl (địa)": "HG_GEOGRAPHY",
    "ls-đl (địa lí)": "HG_GEOGRAPHY",
    "nghệ thuật (ân)": "ARTS_MUSIC",
    "nghệ thuật( mt)": "ARTS_VISUAL",
    "cn": "TECHNOLOGY",
    "công nghệ": "TECHNOLOGY",
}

WEEK1_DATE = {2: "2026-09-07", 3: "2026-09-08", 4: "2026-09-09",
              5: "2026-09-10", 6: "2026-09-11", 7: "2026-09-12"}
DAY_NAME = {2: "Thứ 2", 3: "Thứ 3", 4: "Thứ 4", 5: "Thứ 5", 6: "Thứ 6", 7: "Thứ 7"}


def compact(s):
    return re.sub(r"[\s.]+", "", s).lower()


def normalize_name(s):
    """Fold typographic apostrophes (U+2018/U+2019 etc.) to ASCII and
    collapse whitespace. The source workbook uses U+2019 in "Y H’Phươn",
    which must not become a distinct identity from "Y H'Phươn"."""
    if s is None:
        return None
    s = re.sub(r"[\u2018\u2019\u02BC\u00B4`]", "'", str(s))
    return re.sub(r"\s+", " ", s).strip()


# Normalize mapping-table keys with the same rule used for lookups.
# Fold name apostrophes so PCPN names and alias targets are identical.
TEACHER_ALIASES = {compact(k): normalize_name(v)
                   for k, v in TEACHER_ALIASES.items()}
SUBJECT_LABELS = {compact(k): v for k, v in SUBJECT_LABELS.items()}


def norm(s):
    if s is None:
        return None
    return re.sub(r"\s+", " ", str(s)).strip()


def cell(sheet, r, c):
    if r >= sheet.nrows or c >= sheet.ncols:
        return None
    cl = sheet.cell(r, c)
    if cl.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK):
        return None
    v = cl.value
    if cl.ctype == xlrd.XL_CELL_NUMBER:
        return int(v) if float(v).is_integer() else v
    if isinstance(v, str):
        v = v.strip()
        if v == "":
            return None
    return v


def raw_grid(sheet):
    return [[cell(sheet, r, c) for c in range(sheet.ncols)]
            for r in range(sheet.nrows)]


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                    encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)}")


def main():
    book = xlrd.open_workbook(str(SRC))
    pcpn = book.sheet_by_name("PCPN")
    tkb = book.sheet_by_name("TKB TUẦN 1")
    OUT.mkdir(parents=True, exist_ok=True)

    # ---- source copy + raw grids ------------------------------------------
    (OUT / "source").mkdir(exist_ok=True)
    shutil.copy2(SRC, OUT / "source" / "week1_schedule.xls")
    write_json(OUT / "pcpn-sheet.json",
               {"sheet": "PCPN", "nrows": pcpn.nrows, "ncols": pcpn.ncols,
                "grid": raw_grid(pcpn)})
    write_json(OUT / "tkb-sheet.json",
               {"sheet": "TKB TUẦN 1", "nrows": tkb.nrows, "ncols": tkb.ncols,
                "grid": raw_grid(tkb)})

    # ---- teachers (PCPN rows 7..25) ---------------------------------------
    teachers = []
    for r in range(7, 26):
        if cell(pcpn, r, 1) is None:
            continue
        duty_raw = cell(pcpn, r, 10)
        duties = [norm(x) for x in re.split(r"[\n;]", str(duty_raw))
                  if norm(x)] if duty_raw else []
        teachers.append({
            "orderNo": cell(pcpn, r, 0),
            "fullName": normalize_name(cell(pcpn, r, 1)),
            "specialty": cell(pcpn, r, 2),
            "position": cell(pcpn, r, 3),
            "department": cell(pcpn, r, 4),
            "teaching": {
                "subjectClasses": cell(pcpn, r, 5),
                "lessonsPerUnit": cell(pcpn, r, 6),
                "totalLessons": cell(pcpn, r, 7),
            },
            "extraTeaching": {
                "raw": cell(pcpn, r, 8),
                "lessons": cell(pcpn, r, 9),
            },
            "duties": {
                "raw": duty_raw,
                "items": duties,
                "lessons": cell(pcpn, r, 11),
            },
            "grandTotal": cell(pcpn, r, 12),
            "standardWeekly": cell(pcpn, r, 13),
            "variance": cell(pcpn, r, 14),
            "dayOff": cell(pcpn, r, 15),
        })
    write_json(OUT / "teachers.json", teachers)

    # ---- class columns from TKB header ------------------------------------
    class_cols = {}
    for c in range(3, 19, 2):
        label = norm(tkb.cell_value(5, c))
        code = label.replace("Lớp", "").strip()
        class_cols[c] = code

    # ---- timetable entries (TKB rows 7..50) --------------------------------
    entries = []
    issues = []
    current_day = None
    current_session = None
    max_period_in_session = 0

    for r in range(7, 51):
        d = cell(tkb, r, 0)
        if isinstance(d, str) and d.startswith("Thứ"):
            try:
                current_day = int(d.split()[-1])
                current_session = None
                max_period_in_session = 0
            except ValueError:
                issues.append({"row": r + 1, "type": "BAD_DAY", "value": d})
        s = cell(tkb, r, 1)
        if s in ("S", "Sáng"):
            current_session = "MORNING"
            max_period_in_session = 0
        elif s in ("C", "Chiều"):
            current_session = "AFTERNOON"
            max_period_in_session = 0
        p = cell(tkb, r, 2)
        if isinstance(p, int):
            max_period_in_session = max(max_period_in_session, p)

        row_has_data = any(cell(tkb, r, c) is not None for c in range(3, 19))
        if not row_has_data:
            continue

        period = p if isinstance(p, int) else None
        inferred = False
        if period is None:
            # Unnumbered data row: a new period in the current session
            # (e.g. Excel row 40: Friday morning period 5, grades 8-9 only).
            inferred = True
            period = max_period_in_session + 1
            max_period_in_session = period
            issues.append({
                "row": r + 1, "type": "PERIOD_INFERRED",
                "detail": f"{DAY_NAME.get(current_day)} {current_session} "
                          f"period {period} inferred (no period number in source)",
            })

        for c, code in class_cols.items():
            subject = cell(tkb, r, c)
            teacher = cell(tkb, r, c + 1)
            if subject is None and teacher is None:
                continue
            if subject is None or teacher is None:
                issues.append({
                    "row": r + 1, "type": "MALFORMED_ENTRY",
                    "detail": f"class {code}: subject={subject!r} teacher={teacher!r}",
                })
                continue
            entries.append({
                "day": current_day,
                "date": WEEK1_DATE.get(current_day),
                "session": current_session,
                "period": period,
                "periodInferred": inferred,
                "classCode": code,
                "subjectLabel": subject,
                "subjectCode": SUBJECT_LABELS.get(compact(subject)),
                "teacherAlias": teacher,
                "teacherName": TEACHER_ALIASES.get(compact(teacher)),
                "sourceRow": r + 1,  # 1-based Excel row
            })
            if SUBJECT_LABELS.get(compact(subject)) is None:
                issues.append({"row": r + 1, "type": "UNKNOWN_SUBJECT",
                               "detail": subject})
            if TEACHER_ALIASES.get(compact(teacher)) is None:
                issues.append({"row": r + 1, "type": "UNKNOWN_TEACHER",
                               "detail": teacher})

    write_json(OUT / "timetable-entries.json", {
        "week": 1,
        "classes": list(class_cols.values()),
        "entries": entries,
    })

    # ---- alias + subject catalogs with usage counts ------------------------
    alias_usage = {}
    for e in entries:
        prev = alias_usage.setdefault(e["teacherAlias"], e["teacherName"])
        if prev != e["teacherName"]:
            issues.append({"type": "AMBIGUOUS_ALIAS",
                           "detail": f"{e['teacherAlias']} maps to both "
                                     f"{prev} and {e['teacherName']}"})
    write_json(OUT / "teacher-aliases.json", {
        "note": "Alias forms as they appear in TKB; all verified against PCPN.",
        "aliases": dict(sorted(alias_usage.items())),
    })

    subj_alias_usage = {}
    for e in entries:
        prev = subj_alias_usage.setdefault(e["subjectLabel"], e["subjectCode"])
        if prev != e["subjectCode"]:
            issues.append({"type": "AMBIGUOUS_SUBJECT_LABEL",
                           "detail": f"{e['subjectLabel']} maps to both "
                                     f"{prev} and {e['subjectCode']}"})
    subjects_out = []
    for code, info in SUBJECT_CATALOG.items():
        observed = sorted(a for a, s in subj_alias_usage.items() if s == code)
        subjects_out.append({
            "code": code, "name": info["name"], "component": info["component"],
            "observedLabels": observed,
        })
    write_json(OUT / "subjects.json", subjects_out)

    # ---- meta ---------------------------------------------------------------
    write_json(OUT / "meta.json", {
        "school": norm(pcpn.cell_value(0, 0)),
        "division": norm(pcpn.cell_value(1, 1)),
        "schoolYear": "2026-2027",
        "week": 1,
        "titleDateRange": norm(tkb.cell_value(4, 2)),
        "titleDateRangeNote": "Title says Mon 07/09 - Fri 11/09/2026 but the "
                              "sheet contains Saturday (12/09) lessons.",
        "sessions": [
            {"code": "MORNING", "labelVi": "Sáng", "firstPeriodStart": "07:00",
             "configuredPeriods": 4,
             "note": "Friday morning uses a 5th period (source row without "
                     "period number); configure max 5 morning periods."},
            {"code": "AFTERNOON", "labelVi": "Chiều", "firstPeriodStart": "13:00",
             "configuredPeriods": 3},
        ],
        "pcpnNotes": [norm(pcpn.cell_value(r, c)) for r, c in
                      [(28, 1), (28, 10), (29, 11), (34, 11)]],
        "tkbNotes": [norm(tkb.cell_value(r, c)) for r, c in
                     [(52, 7), (53, 1), (54, 1), (53, 8), (59, 10)]],
        "signedBy": norm(tkb.cell_value(59, 10)) or "Nguyễn Viết Trung",
        "signedDate": "2026-09-06",
    })

    # ---- summary + validation findings --------------------------------------
    findings = list(issues)

    # class double-booking
    seen = {}
    for e in entries:
        key = (e["day"], e["session"], e["period"], e["classCode"])
        if key in seen:
            findings.append({"type": "CLASS_DOUBLE_BOOKED", "detail": str(key)})
        seen[key] = e

    # teacher double-booking
    seen = {}
    for e in entries:
        key = (e["day"], e["session"], e["period"], e["teacherName"])
        if key in seen:
            findings.append({
                "type": "TEACHER_DOUBLE_BOOKED",
                "detail": f"{key} rows {seen[key]['sourceRow']},{e['sourceRow']}",
            })
        seen[key] = e

    # teacher day-off violations
    day_off = {t["fullName"]: t["dayOff"] for t in teachers if t["dayOff"]}
    for e in entries:
        off = day_off.get(e["teacherName"])
        if off:
            try:
                off_day = int(str(off).split()[-1])
            except ValueError:
                continue
            if e["day"] == off_day:
                findings.append({
                    "type": "TEACHER_UNAVAILABLE",
                    "detail": f"{e['teacherName']} teaches {e['classCode']} "
                              f"{e['subjectLabel']} on {DAY_NAME[e['day']]} "
                              f"{e['session']} p{e['period']} "
                              f"but PCPN lists day off = {off} "
                              f"(source row {e['sourceRow']})",
                })

    # per-teacher TKB totals vs PCPN declared teaching totals
    tt_tkb = {}
    for e in entries:
        tt_tkb[e["teacherName"]] = tt_tkb.get(e["teacherName"], 0) + 1
    per_teacher = []
    for t in teachers:
        name = t["fullName"]
        per_teacher.append({
            "fullName": name,
            "pcpnTeachingTotal": t["teaching"]["totalLessons"],
            "tkbScheduledCount": tt_tkb.get(name, 0),
            "diff": (tt_tkb.get(name, 0) or 0) - (t["teaching"]["totalLessons"] or 0),
            "dayOff": t["dayOff"],
        })

    # per class x subject x teacher counts (for assignment coverage checks)
    coverage = {}
    for e in entries:
        key = f"{e['classCode']}|{e['subjectLabel']}|{e['teacherName']}"
        coverage[key] = coverage.get(key, 0) + 1

    # day/session layout
    layout = {}
    for e in entries:
        k = f"{DAY_NAME[e['day']]}|{e['session']}"
        layout.setdefault(k, {"maxPeriod": 0, "entries": 0})
        layout[k]["maxPeriod"] = max(layout[k]["maxPeriod"], e["period"])
        layout[k]["entries"] += 1

    summary = {
        "teacherCount": len(teachers),
        "classCount": len(class_cols),
        "entryCount": len(entries),
        "entriesWithInferredPeriod": sum(1 for e in entries if e["periodInferred"]),
        "perTeacher": per_teacher,
        "coverage": coverage,
        "daySessionLayout": layout,
        "findings": findings,
    }
    write_json(OUT / "summary.json", summary)

    print(f"\nteachers: {len(teachers)}, classes: {len(class_cols)}, "
          f"entries: {len(entries)}")
    print(f"findings: {len(findings)}")
    for f in findings:
        print("  -", f["type"], f.get("detail", ""))


if __name__ == "__main__":
    main()
