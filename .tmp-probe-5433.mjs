import { Client } from "pg";

const candidates = [
  { host: "localhost", port: 5433, user: "postgres", password: "postgres" },
  { host: "localhost", port: 5433, user: "postgres", password: "devpass" },
  { host: "localhost", port: 5433, user: "postgres", password: "" },
];

for (const cfg of candidates) {
  const c = new Client({ ...cfg, connectionTimeoutMillis: 3000 });
  try {
    await c.connect();
    const v = await c.query("select version()");
    console.log("OK", JSON.stringify(cfg), v.rows[0].version.slice(0, 40));
    await c.end();
    break;
  } catch (e) {
    console.log("FAIL", JSON.stringify(cfg), e.code ?? e.message);
    try { await c.end(); } catch {}
  }
}
