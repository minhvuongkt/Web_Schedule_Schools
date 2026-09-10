/**
 * Demo-style screenshot crawler: captures ELEMENT-LEVEL crops (not whole
 * pages) of each feature section — tight padding, capped height, no empty
 * space. Drives headless Edge via CDP.
 * Output: report/screenshots/*.png (overwrites the full-page set)
 */
const BASE = "http://localhost:3000";
const OUT = "F:/Coding/Web_Schedule_School/report/screenshots";
const DEBUG_PORT = 9339;
const fs = await import("node:fs");
await fs.promises.mkdir(OUT, { recursive: true });

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login ${username}: ${res.status}`);
  const [cookie] = res.headers.getSetCookie();
  const [name, value] = cookie.split(";")[0].split("=");
  return { name, value };
}

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const child = (await import("node:child_process")).spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${process.env.TEMP}\\kilo\\edge-cdp-report3`,
  "--no-first-run",
  "about:blank",
], { stdio: "ignore" });

let browser;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 400));
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    browser = await res.json();
    if (browser.webSocketDebuggerUrl) break;
  } catch { /* retry */ }
}
const ws = new WebSocket(browser.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, (msg) => (msg.error ? reject(new Error(method + ": " + JSON.stringify(msg.error))) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

/**
 * Capture one page; `sections` = [{file, sel, nth?, maxH?, viewport?}].
 * - sel + nth: crop that element (8px padding, height capped at maxH).
 * - viewport: true → plain viewport shot (content fills it, e.g. planner).
 */
async function capture(opts) {
  const { url, cookie, width = 1366, height = 760, mobile = false, dsf = 1, waitMs = 2600, sections } = opts;
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  try {
    await send("Page.enable", {}, sessionId);
    await send("Network.enable", {}, sessionId);
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dsf, mobile }, sessionId);
    if (cookie) {
      await send("Network.setCookie", { name: cookie.name, value: cookie.value, url: BASE }, sessionId);
    }
    await send("Page.navigate", { url }, sessionId);
    await new Promise((r) => setTimeout(r, waitMs));

    for (const sec of sections) {
      let clip = null;
      if (sec.viewport) {
        clip = { x: 0, y: 0, width, height, scale: 1 };
      } else {
        const rectRes = await send("Runtime.evaluate", {
          expression: `(() => {
            const list = document.querySelectorAll(${JSON.stringify(sec.sel)});
            const el = list[${sec.nth ?? 0}];
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height });
          })()`,
          returnByValue: true,
        }, sessionId);
        const rect = rectRes.result.value ? JSON.parse(rectRes.result.value) : null;
        if (!rect) {
          console.log(`  !! selector not found: ${sec.sel} — viewport fallback (${sec.file})`);
          clip = { x: 0, y: 0, width, height: Math.min(height, 700), scale: 1 };
        } else {
          const pad = 8;
          const maxH = sec.maxH ?? 820;
          const maxW = sec.maxW ?? width;
          clip = {
            x: Math.max(0, rect.x - pad),
            y: Math.max(0, rect.y - pad),
            width: Math.min(rect.w + pad * 2, maxW),
            height: Math.min(rect.h + pad * 2, maxH),
            scale: 1,
          };
        }
      }
      const { data } = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip,
      }, sessionId);
      await fs.promises.writeFile(`${OUT}/${sec.file}`, Buffer.from(data, "base64"));
      console.log("captured:", sec.file);
    }
  } finally {
    await send("Target.closeTarget", { targetId });
  }
}

const admin = await login("admin", "Dev@12345");
const principal = await login("principal", "Dev@12345");
const teacher = await login("t01", "Dev@12345");

// ---------- public ----------------------------------------------------------
await capture({
  url: `${BASE}/`, waitMs: 2200,
  sections: [
    { file: "01a-hero.png", sel: "main section", nth: 0, maxH: 620 },
    { file: "01b-features.png", sel: "main section", nth: 1, maxH: 620 },
  ],
});

await capture({
  url: `${BASE}/dang-nhap`, waitMs: 1600,
  sections: [{ file: "02-login.png", sel: "main", maxH: 640 }],
});

await capture({
  url: `${BASE}/tkb`, waitMs: 2200,
  sections: [{ file: "03-tkb-classes.png", sel: "main", maxH: 900 }],
});

await capture({
  url: `${BASE}/tkb/6A`, waitMs: 2600,
  sections: [{ file: "04-tkb-class-6a.png", sel: "main", maxH: 1000 }],
});

await capture({
  url: `${BASE}/huong-dan`, waitMs: 2000,
  sections: [
    { file: "05a-guide-cards.png", sel: "nav[aria-label='Vai trò']", maxH: 480 },
    { file: "05b-guide-steps.png", sel: "main ol", nth: 0, maxH: 560 },
  ],
});

// ---------- student app (mobile) ------------------------------------------------
await capture({
  url: `${BASE}/hsv?lop=6A`, width: 390, height: 780, mobile: true, dsf: 2, waitMs: 3000,
  sections: [
    { file: "06a-next-lesson.png", sel: "section[aria-label='Tiết kế tiếp']", maxH: 400 },
    { file: "06b-today.png", sel: "section[aria-label='Thời khóa biểu hôm nay']", maxH: 700 },
  ],
});

await capture({
  url: `${BASE}/hsv/thoi-khoa-bieu?lop=6A`, width: 390, height: 780, mobile: true, dsf: 2, waitMs: 3000,
  sections: [
    { file: "07a-daystrip.png", sel: "ul[role='tablist']", maxH: 220 },
    { file: "07b-day.png", sel: "section[aria-label='Sáng']", maxH: 640 },
  ],
});

await capture({
  url: `${BASE}/hsv/thong-bao?lop=6A`, width: 390, height: 780, mobile: true, dsf: 2, waitMs: 2400,
  sections: [{ file: "08-notifications.png", sel: "main ul", maxH: 520 }],
});

await capture({
  url: `${BASE}/hsv/ho-so?lop=6A`, width: 390, height: 780, mobile: true, dsf: 2, waitMs: 2000,
  sections: [{ file: "09-profile.png", sel: "main section", maxH: 560 }],
});

// ---------- teacher ------------------------------------------------------------
await capture({
  url: `${BASE}/gv`, cookie: teacher, waitMs: 3200,
  sections: [
    { file: "10a-workload.png", sel: "[aria-label='Tổng kết khối lượng công tác trong tuần']", maxH: 360 },
    { file: "10b-today.png", viewport: true },
  ],
});

await capture({
  url: `${BASE}/gv/thong-bao`, cookie: teacher, waitMs: 2400,
  sections: [{ file: "11-teacher-notifications.png", sel: "main", maxH: 620 }],
});

// ---------- leadership ------------------------------------------------------------
await capture({
  url: `${BASE}/bg`, cookie: principal, waitMs: 3200,
  sections: [{ file: "12-overview.png", sel: "main", maxH: 900 }],
});

await capture({
  url: `${BASE}/bg/phan-cong`, cookie: principal, waitMs: 3200,
  sections: [{ file: "13-assignments.png", sel: "main table", maxH: 760 }],
});

// ---------- admin -----------------------------------------------------------------
await capture({
  url: `${BASE}/admin`, cookie: admin, waitMs: 5000,
  sections: [{ file: "14-planner.png", viewport: true }],
});

await capture({
  url: `${BASE}/admin/danh-muc`, cookie: admin, waitMs: 3000,
  sections: [{ file: "15-catalogs.png", sel: "main table", maxH: 760 }],
});

await capture({
  url: `${BASE}/admin/tai-khoan`, cookie: admin, waitMs: 3200,
  sections: [{ file: "16-accounts.png", sel: "main table", maxH: 760 }],
});

await capture({
  url: `${BASE}/admin/import`, cookie: admin, waitMs: 2600,
  sections: [
    { file: "17a-import-form.png", sel: "main section", nth: 0, maxH: 620 },
    { file: "17b-import-dropzone.png", sel: "[role='button'][aria-label*='kéo thả']", maxH: 300 },
  ],
});

await capture({
  url: `${BASE}/admin/audit`, cookie: admin, waitMs: 3200,
  sections: [{ file: "18-audit.png", sel: "main table", maxH: 760 }],
});

await capture({
  url: `${BASE}/admin/thay-giao`, cookie: admin, waitMs: 3600,
  sections: [{ file: "19-substitutions.png", sel: "main", maxH: 760 }],
});

ws.close();
child.kill();
console.log("DONE");
process.exit(0);
