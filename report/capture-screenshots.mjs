/**
 * Screenshot crawler: drives headless Edge via CDP, logs in as each role
 * (admin / principal / teacher) and captures full-page PNGs of every page.
 * Output: report/screenshots/*.png
 */
const BASE = "http://localhost:3000";
const OUT = "F:/Coding/Web_Schedule_School/report/screenshots";
const DEBUG_PORT = 9336;
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

async function main() {
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const child = (await import("node:child_process")).spawn(edge, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${process.env.TEMP}\\kilo\\edge-cdp-report`,
    "--no-first-run",
    "about:blank",
  ], { stdio: "ignore" });

  // wait for CDP
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

  async function newPage() {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    return { targetId, sessionId };
  }

  async function shot(opts) {
    const { path, url, cookie, width = 1366, height = 900, mobile = false, waitMs = 2500, dsf = 1 } = opts;
    const { targetId, sessionId } = await newPage();
    try {
      await send("Page.enable", {}, sessionId);
      await send("Network.enable", {}, sessionId);
      await send("Emulation.setDeviceMetricsOverride", {
        width, height, deviceScaleFactor: dsf, mobile,
      }, sessionId);
      if (cookie) {
        await send("Network.setCookie", { name: cookie.name, value: cookie.value, url: BASE }, sessionId);
      }
      await send("Page.navigate", { url }, sessionId);
      await new Promise((r) => setTimeout(r, waitMs));
      const { data } = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
      }, sessionId);
      await fs.promises.writeFile(`${OUT}/${path}`, Buffer.from(data, "base64"));
      console.log("captured:", path);
    } finally {
      await send("Target.closeTarget", { targetId });
    }
  }

  // ---- sessions -----------------------------------------------------------
  const admin = await login("tkbadmin", "Dev@12345");
  const principal = await login("principal", "Dev@12345");
  const teacher = await login("t01", "Dev@12345");

  // ---- public site (desktop) ------------------------------------------------
  await shot({ path: "01-landing.png", url: `${BASE}/`, waitMs: 2000 });
  await shot({ path: "02-login.png", url: `${BASE}/dang-nhap`, waitMs: 1500 });
  await shot({ path: "03-tkb-classes.png", url: `${BASE}/tkb`, waitMs: 2000 });
  await shot({ path: "04-tkb-class-6a.png", url: `${BASE}/tkb/6A`, waitMs: 2500 });
  await shot({ path: "05-guide.png", url: `${BASE}/huong-dan`, waitMs: 2000 });

  // ---- student app (mobile) ---------------------------------------------------
  await shot({ path: "06-student-home.png", url: `${BASE}/hsv?lop=6A`, width: 390, height: 844, mobile: true, dsf: 2, waitMs: 3000 });
  await shot({ path: "07-student-week.png", url: `${BASE}/hsv/thoi-khoa-bieu?lop=6A`, width: 390, height: 844, mobile: true, dsf: 2, waitMs: 3000 });
  await shot({ path: "08-student-notifications.png", url: `${BASE}/hsv/thong-bao?lop=6A`, width: 390, height: 844, mobile: true, dsf: 2, waitMs: 2500 });
  await shot({ path: "09-student-profile.png", url: `${BASE}/hsv/ho-so?lop=6A`, width: 390, height: 844, mobile: true, dsf: 2, waitMs: 2000 });

  // ---- teacher (desktop) -------------------------------------------------------
  await shot({ path: "10-teacher-home.png", url: `${BASE}/gv`, cookie: teacher, waitMs: 3000 });
  await shot({ path: "11-teacher-notifications.png", url: `${BASE}/gv/thong-bao`, cookie: teacher, waitMs: 2500 });

  // ---- leadership (desktop) ------------------------------------------------------
  await shot({ path: "12-leadership-overview.png", url: `${BASE}/bg`, cookie: principal, waitMs: 3000 });
  await shot({ path: "13-leadership-assignments.png", url: `${BASE}/bg/phan-cong`, cookie: principal, waitMs: 3000 });

  // ---- admin / planner (desktop) ------------------------------------------------
  await shot({ path: "14-admin-planner.png", url: `${BASE}/admin`, cookie: admin, waitMs: 5000 });
  await shot({ path: "15-admin-catalogs.png", url: `${BASE}/admin/danh-muc`, cookie: admin, waitMs: 3000 });
  await shot({ path: "16-admin-accounts.png", url: `${BASE}/admin/tai-khoan`, cookie: admin, waitMs: 3000 });
  await shot({ path: "17-admin-import.png", url: `${BASE}/admin/import`, cookie: admin, waitMs: 2500 });
  await shot({ path: "18-admin-audit.png", url: `${BASE}/admin/audit`, cookie: admin, waitMs: 3000 });
  await shot({ path: "19-admin-substitutions.png", url: `${BASE}/admin/thay-giao`, cookie: admin, waitMs: 3500 });

  ws.close();
  child.kill();
  console.log("DONE");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
