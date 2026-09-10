const BASE = "http://localhost:3000";

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login ${username}: ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { cookie, body: await res.json() };
}

async function api(cookie, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Mirrors the server's copyEntries skip logic so the E2E can predict the
 * exact outcome for the real Week-01 fixture (occupied cells, teacher and
 * room conflicts, intra-batch reservations).
 */
function simulateCopy(allEntries, versionId, items) {
  const byId = new Map(allEntries.map((e) => [e.id, e]));
  const classSlot = new Set();
  const teacherSlot = new Set();
  const roomSlot = new Set();
  for (const e of allEntries) {
    classSlot.add(`${e.academicDayId}|${e.periodId}|${e.classId}`);
    if (e.teacherId) teacherSlot.add(`${e.academicDayId}|${e.periodId}|${e.teacherId}`);
    if (e.roomId) roomSlot.add(`${e.academicDayId}|${e.periodId}|${e.roomId}`);
  }
  const skipped = [];
  const created = [];
  for (const item of items) {
    const source = byId.get(item.entryId);
    if (!source) {
      skipped.push({ entryId: item.entryId, code: "ENTRY_NOT_FOUND" });
      continue;
    }
    if (
      source.academicDayId === item.academicDayId &&
      source.periodId === item.periodId &&
      source.classId === item.classId
    ) {
      skipped.push({ entryId: item.entryId, code: "CLASS_DOUBLE_BOOKED" });
      continue;
    }
    if (classSlot.has(`${item.academicDayId}|${item.periodId}|${item.classId}`)) {
      skipped.push({ entryId: item.entryId, code: "CLASS_DOUBLE_BOOKED" });
      continue;
    }
    if (source.teacherId && teacherSlot.has(`${item.academicDayId}|${item.periodId}|${source.teacherId}`)) {
      skipped.push({ entryId: item.entryId, code: "TEACHER_DOUBLE_BOOKED" });
      continue;
    }
    if (source.roomId && roomSlot.has(`${item.academicDayId}|${item.periodId}|${source.roomId}`)) {
      skipped.push({ entryId: item.entryId, code: "ROOM_DOUBLE_BOOKED" });
      continue;
    }
    classSlot.add(`${item.academicDayId}|${item.periodId}|${item.classId}`);
    if (source.teacherId) teacherSlot.add(`${item.academicDayId}|${item.periodId}|${source.teacherId}`);
    if (source.roomId) roomSlot.add(`${item.academicDayId}|${item.periodId}|${source.roomId}`);
    created.push(item);
  }
  return { created, skipped };
}

async function main() {
  const admin = await login("admin", "Dev@12345");
  const teacher = await login("t01", "Dev@12345");

  // --- Locate published version + week -------------------------------------
  const weeks = (await api(admin.cookie, "/api/weeks")).body.weeks;
  const week = weeks.find((w) => w.hasPublished);
  const versions = (await api(admin.cookie, `/api/timetable/versions?weekId=${week.id}`)).body.versions;
  const published = versions.find((v) => v.status === "PUBLISHED");

  // --- RBAC: teacher cannot copy --------------------------------------------
  const rbac = await api(teacher.cookie, "/api/timetable/entries/copy", {
    method: "POST",
    body: JSON.stringify({
      versionId: published.id,
      items: [{ entryId: "x", academicDayId: "y", periodId: "z", classId: "w" }],
      expectedRevision: 0,
      mode: "copy-day",
    }),
  });
  check("RBAC: teacher gets 403", rbac.status === 403, `status=${rbac.status}`);

  // --- Non-DRAFT version is rejected ----------------------------------------
  const pubGrid = (await api(admin.cookie, `/api/timetable/versions/${published.id}`)).body;
  const someEntry = pubGrid.entries[0];
  const notDraft = await api(admin.cookie, "/api/timetable/entries/copy", {
    method: "POST",
    body: JSON.stringify({
      versionId: published.id,
      items: [
        {
          entryId: someEntry.id,
          academicDayId: someEntry.academicDayId,
          periodId: someEntry.periodId,
          classId: someEntry.classId,
        },
      ],
      expectedRevision: 99,
      mode: "copy-day",
    }),
  });
  check(
    "PUBLISHED version → 409 PUBLISHED_VERSION_MUTATION",
    notDraft.status === 409 && notDraft.body.error?.code === "PUBLISHED_VERSION_MUTATION",
    `status=${notDraft.status} code=${notDraft.body.error?.code}`,
  );

  // --- Create a working draft (clone of published) ---------------------------
  const draft = (
    await api(admin.cookie, "/api/timetable/versions", {
      method: "POST",
      body: JSON.stringify({ weekId: week.id, copyFromVersionId: published.id }),
    })
  ).body;
  check("draft created", Boolean(draft.version?.id));
  const draftId = draft.version.id;
  let revision = draft.version.revision;

  const grid = (await api(admin.cookie, `/api/timetable/versions/${draftId}`)).body;
  let entries = grid.entries;
  const initialCount = entries.length;

  // --- Validation errors ------------------------------------------------------
  const stale = await api(admin.cookie, "/api/timetable/entries/copy", {
    method: "POST",
    body: JSON.stringify({
      versionId: draftId,
      items: [
        {
          entryId: someEntry.id,
          academicDayId: someEntry.academicDayId,
          periodId: someEntry.periodId,
          classId: someEntry.classId,
        },
      ],
      expectedRevision: revision + 5,
      mode: "copy-day",
    }),
  });
  check(
    "stale expectedRevision → 409 VERSION_OUTDATED",
    stale.status === 409 && stale.body.error?.code === "VERSION_OUTDATED",
    `status=${stale.status}`,
  );

  const emptyItems = await api(admin.cookie, "/api/timetable/entries/copy", {
    method: "POST",
    body: JSON.stringify({ versionId: draftId, items: [], expectedRevision: revision, mode: "copy-day" }),
  });
  check("empty items → 400", emptyItems.status === 400, `status=${emptyItems.status}`);

  // --- copy-day: simulate then compare ---------------------------------------
  const classA = entries[0].classId;
  const schoolDays = grid.days.filter((d) => d.isSchoolDay);
  const sourceDay = schoolDays.find(
    (d) => entries.filter((e) => e.classId === classA && e.academicDayId === d.id).length > 0,
  );
  const targetDay = schoolDays.find((d) => d.id !== sourceDay.id);
  const dayItems = entries
    .filter((e) => e.classId === classA && e.academicDayId === sourceDay.id)
    .map((e) => ({
      entryId: e.id,
      academicDayId: targetDay.id,
      periodId: e.periodId,
      classId: e.classId,
    }));

  const expectedDay = simulateCopy(entries, draftId, dayItems);
  const copyDay = await api(admin.cookie, "/api/timetable/entries/copy", {
    method: "POST",
    body: JSON.stringify({ versionId: draftId, items: dayItems, expectedRevision: revision, mode: "copy-day" }),
  });
  check(
    "copy-day matches simulated outcome",
    copyDay.status === 200 &&
      copyDay.body.createdIds?.length === expectedDay.created.length &&
      copyDay.body.skipped?.length === expectedDay.skipped.length,
    `server: ${copyDay.body.createdIds?.length ?? "?"} created / ${copyDay.body.skipped?.length ?? "?"} skipped · sim: ${expectedDay.created.length} / ${expectedDay.skipped.length}`,
  );
  check(
    "copy-day bump: revision +1",
    copyDay.body.revision === revision + 1,
    `rev ${revision} → ${copyDay.body.revision}`,
  );
  revision = copyDay.body.revision;
  const dayCreatedIds = copyDay.body.createdIds ?? [];

  const afterDay = (await api(admin.cookie, `/api/timetable/versions/${draftId}`)).body;
  check(
    "grid entry count = initial + created",
    afterDay.entries.length === initialCount + dayCreatedIds.length,
    `${afterDay.entries.length} vs ${initialCount + dayCreatedIds.length}`,
  );
  entries = afterDay.entries;

  // --- undo semantics: chained deletes (what the client does) -----------------
  let rev = revision;
  for (const id of dayCreatedIds) {
    const del = await api(admin.cookie, `/api/timetable/entries/${id}?expectedRevision=${rev}`, {
      method: "DELETE",
    });
    if (del.status !== 200) throw new Error(`undo delete ${id}: ${del.status}`);
    rev = del.body.revision;
  }
  revision = rev;
  const afterUndo = (await api(admin.cookie, `/api/timetable/versions/${draftId}`)).body;
  check(
    "undo chain restores count",
    afterUndo.entries.length === initialCount,
    `${afterUndo.entries.length} vs ${initialCount}`,
  );
  entries = afterUndo.entries;

  // --- copy-entry: forced-free cell → must be created -------------------------
  const source = entries.find((e) => e.classId === classA);
  // find an empty cell of classA on a different day
  const busy = new Set(
    entries.filter((e) => e.classId === classA).map((e) => `${e.academicDayId}|${e.periodId}`),
  );
  let freeCell = null;
  for (const day of schoolDays) {
    for (const period of grid.periods) {
      const key = `${day.id}|${period.id}`;
      if (busy.has(key)) continue;
      const teacherBusy = entries.some(
        (e) => e.academicDayId === day.id && e.periodId === period.id && e.teacherId === source.teacherId,
      );
      if (!teacherBusy) {
        freeCell = { dayId: day.id, periodId: period.id };
        break;
      }
    }
    if (freeCell) break;
  }
  check("found a conflict-free target cell", Boolean(freeCell));
  if (freeCell) {
    const paste = await api(admin.cookie, "/api/timetable/entries/copy", {
      method: "POST",
      body: JSON.stringify({
        versionId: draftId,
        items: [
          {
            entryId: source.id,
            academicDayId: freeCell.dayId,
            periodId: freeCell.periodId,
            classId: classA,
          },
        ],
        expectedRevision: revision,
        mode: "copy-entry",
      }),
    });
    check("paste into free cell → 1 created", paste.body.createdIds?.length === 1, JSON.stringify(paste.body.skipped));
    revision = paste.body.revision;
    const pasteId = paste.body.createdIds?.[0];

    // Same source pasted onto the SAME cell → skipped (source occupies it)
    const selfPaste = await api(admin.cookie, "/api/timetable/entries/copy", {
      method: "POST",
      body: JSON.stringify({
        versionId: draftId,
        items: [
          {
            entryId: source.id,
            academicDayId: source.academicDayId,
            periodId: source.periodId,
            classId: classA,
          },
        ],
        expectedRevision: revision,
        mode: "copy-entry",
      }),
    });
    check(
      "paste onto itself → skipped, no 409",
      selfPaste.status === 200 && selfPaste.body.createdIds?.length === 0,
      `skipped: ${selfPaste.body.skipped?.[0]?.code}`,
    );

    // cleanup the pasted entry
    const del = await api(admin.cookie, `/api/timetable/entries/${pasteId}?expectedRevision=${selfPaste.body.revision}`, {
      method: "DELETE",
    });
    check("cleanup pasted entry", del.status === 200);
  }

  // --- copy-class onto intact class → all skipped ------------------------------
  const classes = [...new Set(entries.map((e) => e.classId))];
  const srcClass = classes[0];
  const dstClass = classes[1];
  const classItems = entries
    .filter((e) => e.classId === srcClass)
    .map((e) => ({
      entryId: e.id,
      academicDayId: e.academicDayId,
      periodId: e.periodId,
      classId: dstClass,
    }));
  const expectedClass = simulateCopy(entries, draftId, classItems);
  const copyClass = await api(admin.cookie, "/api/timetable/entries/copy", {
    method: "POST",
    body: JSON.stringify({
      versionId: draftId,
      items: classItems,
      expectedRevision: revision,
      mode: "copy-class",
    }),
  });
  check(
    "copy-class matches simulated outcome",
    copyClass.status === 200 &&
      copyClass.body.createdIds?.length === expectedClass.created.length &&
      copyClass.body.skipped?.length === expectedClass.skipped.length,
    `server: ${copyClass.body.createdIds?.length ?? "?"} created / ${copyClass.body.skipped?.length ?? "?"} skipped · sim: ${expectedClass.created.length} / ${expectedClass.skipped.length}`,
  );
  revision = copyClass.body.revision ?? revision;

  // --- foreign entry id → ENTRY_NOT_FOUND skip ---------------------------------
  const foreign = await api(admin.cookie, "/api/timetable/entries/copy", {
    method: "POST",
    body: JSON.stringify({
      versionId: draftId,
      items: [
        {
          entryId: "does-not-exist",
          academicDayId: sourceDay.id,
          periodId: grid.periods[0].id,
          classId: classA,
        },
      ],
      expectedRevision: revision,
      mode: "copy-day",
    }),
  });
  check(
    "foreign entryId → skipped ENTRY_NOT_FOUND",
    foreign.status === 200 &&
      foreign.body.createdIds?.length === 0 &&
      foreign.body.skipped?.[0]?.code === "ENTRY_NOT_FOUND",
  );

  // --- audit trail -------------------------------------------------------------
  const audit = await api(admin.cookie, `/api/audit?entityType=TimetableEntry&limit=10`);
  const copyAudit = (audit.body.entries ?? []).find(
    (e) => e.after && (e.after.mode === "copy-day" || e.after.mode === "copy-class" || e.after.mode === "copy-entry"),
  );
  check("batch copy recorded in audit log", Boolean(copyAudit));

  // --- cleanup: delete the draft version ---------------------------------------
  const delDraft = await api(admin.cookie, `/api/timetable/versions/${draftId}`, { method: "DELETE" });
  check("draft deleted (fixture restored)", delDraft.status === 200);

  const failed = checks.filter(([, ok]) => !ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length > 0) {
    console.log("FAILED:", failed.map(([name]) => name).join("; "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
