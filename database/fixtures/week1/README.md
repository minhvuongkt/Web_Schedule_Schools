# Week 01 Fixture

Source: `week1_schedule.xls` (copied to `source/`), sheets `PCPN` and
`TKB TUẦN 1`, school year 2026–2027, extracted by
`scripts/extract_week1_fixture.py`.

Contents:

| File | Contents |
|---|---|
| `source/week1_schedule.xls` | Copy of the source workbook |
| `pcpn-sheet.json` / `tkb-sheet.json` | Raw trimmed cell grids (row-major, 0-based indices) |
| `teachers.json` | 19 teacher records from PCPN (assignments kept as raw strings) |
| `subjects.json` | Normalized subject catalog with components + observed source labels |
| `teacher-aliases.json` | TKB alias forms → teacher full name (verified) |
| `timetable-entries.json` | 236 normalized week-1 entries |
| `meta.json` | School, sessions, period starts, footer notes |
| `summary.json` | Counts, per-teacher reconciliation, coverage table, findings |

## Verified facts about the source data

- 8 classes: 6A, 6B, 7A, 7B, 8A, 8B, 9A, 9B.
- 19 teachers; all 19 PCPN teaching totals reconcile exactly with the TKB
  (scheduled entry counts per teacher, after alias resolution).
- School days are Monday–**Saturday**. Afternoons exist only on Monday and
  Thursday. Saturday morning has 3 periods.
- Morning has 4 periods normally, but **Friday morning uses a 5th period**
  (grades 8–9 only) — the source row (Excel row 40) has no period number;
  the extractor infers period 5 and flags it.
- Morning period 1 starts 07:00, afternoon period 1 starts 13:00 (footer notes).
- No class or teacher double-booking exists in the source week — the 236
  entries are internally conflict-free.

## Domain corrections and mapping decisions

1. **`CN` in the TKB means Công nghệ (Technology), not Chủ nhiệm (homeroom).**
   Every `CN` entry is taught by the teacher that PCPN assigns
   `CN <grade>` / `Công nghệ <grade>` (Quyên CN 6, Hiền CN 7, Hằng CN 8–9).
   The earlier planning document (`ke_hoach_xay_dung_website_thoi_khoa_bieu_truong.md`,
   Appendix B) mapped `CN → HOMEROOM`; that mapping is wrong for this workbook.
   Homeroom duties appear in PCPN `Kiêm nhiệm` (Chủ nhiệm …, 4 tiết/week).
2. **Subject components are real**: `KHTN(L/H/S)` and `LS&ĐL(LS/Địa)` are
   components of integrated subjects (`NATURAL_SCIENCE`, `HISTORY_GEOGRAPHY`);
   `Nghệ thuật (ÂN/MT)` are components of `ARTS`. One subject ≠ one teacher.
3. **Teacher aliases have multiple variant forms** for the same person:
   `C.Tâm`, `C. Tâm`, `C.Hoài Tâm` → Nguyễn Thị Hoài Tâm; `C.Nam`, `Y Nam` →
   Y Nam. Aliases are import/export labels only — never stable IDs.
4. **Name normalization matters**: PCPN writes `Y H’Phươn` with U+2019
   (typographic apostrophe). Import must fold `’` → `'` or the teacher becomes
   two identities.
5. **PCPN `Tiết/lớp` notation is per-grade totals**, e.g. `8/6` = 8 lessons/week
   across all grade-6 classes (4 per class). `4/6A` = per-class. The PCPN
   `Số tiết thừa/thiếu` column is a manually entered value — the system must
   recompute, not trust it.
6. **Workload quota varies by position** (`Số tiết so với QĐ/Tuần`):
   Hiệu trưởng 2, P.Hiệu trưởng 4, GV 17. Duties (Chủ nhiệm 4, Tổ trưởng 3,
   Tổ phó 1, …) carry lesson equivalents counted in `Tổng cộng`.

## Source-data findings (must surface as import validation issues)

| # | Type | Detail |
|---|---|---|
| 1 | `DATE_RANGE_MISMATCH` | TKB title says 07/09–11/09/2026 (Mon–Fri) but Saturday 12/09 has lessons |
| 2 | `PERIOD_INFERRED` | Friday morning period 5 has no period number in the source (Excel row 40) |
| 3 | `TEACHER_UNAVAILABLE` | Trần Anh Khoa teaches 7A Văn on Thứ 5 p1+p2 while PCPN lists his day off as Thứ 5 |
| 4 | `SOURCE_TYPO` | PCPN row 8: subject `Ngữ Văn 7B` but lessons `4/6` (should be `4/7B`; TKB confirms 4 lessons for 7B) |
| 5 | `SOURCE_TYPO` | PCPN Y Nam: `HDTN-HN 9B` with lessons `3/9A` (TKB confirms 3 lessons for 9B) |
| 6 | `SOURCE_NOTE` | PCPN note “Chưa có phân công dạy GDĐP 8 tiết/tuần” — yet structured GDĐP assignments totalling 8 lessons/week exist (Khoa 8: 2, Hiên 7: 2, Vinh 6: 2, Nam 9: 2) and all match the TKB; treat the note as stale, rely on structured data |
| 7 | `LABEL_TYPO` | TKB header `GV thực hiên` (should be `GV thực hiện`); footer signed at “Măng Đen” vs PCPN “Măng Cành” |

These cases are deliberate regression material: the import pipeline and
conflict engine tests must reproduce them.
