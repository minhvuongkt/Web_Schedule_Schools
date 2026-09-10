import { spawn } from "node:child_process";
import net from "node:net";

const BIN = "F:/Coding/Web_Schedule_School/node_modules/@embedded-postgres/windows-x64/native/bin/postgres.exe";
const D = "F:/Coding/Web_Schedule_School/.pgdata-fresh";

function probe(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port, timeout: 1000 });
    s.on("connect", () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
    s.on("timeout", () => { s.destroy(); resolve(false); });
  });
}

const variants = process.argv[2] ? [process.argv[2]] : ["inherit", "ignore", "pipe"];

for (const v of variants) {
  console.log(`--- variant: stdio=${v} ---`);
  const stdio = v === "inherit" ? "inherit" : v === "ignore" ? "ignore" : ["ignore", "pipe", "pipe"];
  const child = spawn(BIN, ["-D", D, "-p", "5435"], { stdio });
  let out = "";
  if (Array.isArray(stdio)) {
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
  }
  child.unref();
  await new Promise((r) => setTimeout(r, 4000));
  const alive = !child.killed && child.exitCode === null;
  const up = await probe(5435);
  console.log(`alive=${alive} exitCode=${child.exitCode} listening=${up}`);
  if (out) console.log("captured:", out.slice(0, 300));
  if (up) {
    console.log("SUCCESS with", v);
    process.exit(0);
  }
  if (alive) child.kill();
  await new Promise((r) => setTimeout(r, 1500));
}
console.log("no variant worked");
