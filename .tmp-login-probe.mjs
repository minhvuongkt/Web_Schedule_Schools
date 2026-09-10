const BASE = "http://localhost:3000";

async function main() {
  for (const username of ["admin", "tkbadmin", "t01", "t05"]) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "Dev@12345" }),
    });
    const body = await res.json().catch(() => ({}));
    console.log(`${username}: ${res.status}`, body.error?.code ?? body.user?.role ?? "");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
