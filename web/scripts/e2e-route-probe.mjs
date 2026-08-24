const routes = [
  ["GET", "/api/account/summary"],
  ["POST", "/api/tasks/ensure"],
  ["GET", "/api/notifications"],
  ["POST", "/api/withdraw"],
  ["POST", "/api/returns/request"],
  ["POST", "/api/upgrades/request"],
  ["GET", "/api/admin/returns"],
  ["GET", "/api/admin/upgrades"],
  ["GET", "/api/admin/overview"],
];
for (const [m, p] of routes) {
  try {
    const res = await fetch("http://localhost:3000" + p, {
      method: m,
      headers: { "Content-Type": "application/json" },
      body: m === "POST" ? "{}" : undefined,
    });
    const t = await res.text();
    console.log(`${m} ${p} -> ${res.status} | ${t.slice(0, 80).split(String.fromCharCode(10)).join(" ")}`);
  } catch (e) {
    console.log(`${m} ${p} -> ERR ${e.message}`);
  }
}