const routes = [
  "/",
  "/login",
  "/login/admin",
  "/login/employee",
  "/dashboard",
  "/employees",
  "/employees/add",
  "/employer",
  "/tasks",
  "/tasks/performance",
  "/payroll",
  "/attendance",
  "/leaves",
  "/notices",
  "/notifications",
  "/settings",
  "/reports",
  "/documents",
  "/issues",
  "/forgot-password",
  "/reset-password"
];

async function checkRoutes() {
  console.log("=== CHECKING ROUTE ACCESSIBILITY ===");
  let failed = 0;
  for (const r of routes) {
    try {
      const res = await fetch(`http://localhost:3001${r}`, { redirect: "manual" });
      const status = res.status;
      // 200, 307 (auth redirect), or 302 are valid responses from the Next.js router
      const ok = status === 200 || status === 307 || status === 302 || status === 308;
      console.log(`Route: ${r.padEnd(24)} -> Status: ${status} ${ok ? "✓" : "✗"}`);
      if (!ok) failed++;
    } catch (err) {
      console.error(`Route: ${r.padEnd(24)} -> Failed with error:`, err.message);
      failed++;
    }
  }
  console.log(`\nRoute check complete: ${routes.length - failed}/${routes.length} routes healthy.`);
  process.exit(failed > 0 ? 1 : 0);
}

checkRoutes();

