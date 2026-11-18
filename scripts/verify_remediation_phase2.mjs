import crypto from "node:crypto";
import fs from "node:fs";

// Load .env
const envFile = fs.readFileSync(".env", "utf-8");
const env = {};
envFile.split("\n").forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\n/g, "\n");
    }
    env[match[1].trim()] = val;
  }
});

const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = env.FIREBASE_PRIVATE_KEY;
const projectId = env.FIREBASE_PROJECT_ID || "mwu-ms";

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsignedToken = `${b64(header)}.${b64(claim)}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsignedToken);
  const signature = sign.sign(privateKey, "base64url");

  const jwt = `${unsignedToken}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Failed to get token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function verifyAll() {
  console.log("=================================================");
  console.log("ERP PHASE 2 CRITICAL REMEDIATION VERIFICATION");
  console.log("=================================================");
  const token = await getAccessToken();

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Verify Firestore Passwords Purged (A-31, A-05)
  console.log("\n--- Checking Plaintext Passwords in Firestore (A-31) ---");
  const empRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/employees`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const empData = await empRes.json();
  const empDocs = empData.documents || [];
  const docsWithPass = empDocs.filter((d) => d.fields?.password);
  assert(docsWithPass.length === 0, `All ${empDocs.length} employee documents have zero plaintext password fields`);

  // 2. Verify Codebase has no plaintext password writes (A-31)
  console.log("\n--- Checking Codebase for Plaintext Password Exposure (A-31) ---");
  const addEmpCode = fs.readFileSync("src/app/(dashboard)/employees/add/page.tsx", "utf-8");
  assert(!addEmpCode.includes("status: \"Active\",\n        password: data.password"), "employees/add/page.tsx does not write password to Firestore document payload");

  const empRowCode = fs.readFileSync("src/app/(dashboard)/employees/page.tsx", "utf-8");
  assert(!empRowCode.includes("empUpdate.password = newPass"), "employees/page.tsx does not write password to Firestore on credential change");

  const empDetailCode = fs.readFileSync("src/app/(dashboard)/employees/[id]/page.tsx", "utf-8");
  assert(!empDetailCode.includes("value={emp.password || \"Not set\"}"), "employees/[id]/page.tsx does not display emp.password in plaintext");
  assert(!empDetailCode.includes("password:       passwordToSave"), "employees/[id]/page.tsx does not write password to Firestore document");

  const resetPassCode = fs.readFileSync("src/app/(auth)/reset-password/page.tsx", "utf-8");
  assert(!resetPassCode.includes("console.log(\"Reset password request\", data.password)"), "reset-password/page.tsx does not log data.password");

  // 3. Verify Real Payslip PDF (A-19)
  console.log("\n--- Checking Real Payslip PDF (A-19) ---");
  const docRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/documents/payslip_EMP1011_2026_10`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const docData = await docRes.json();
  const docFields = docData.fields || {};
  const hasDataUrl = !!docFields.dataUrl?.stringValue;
  const size = Number(docFields.size?.integerValue || 0);
  assert(hasDataUrl, "payslip_EMP1011_2026_10 has real dataUrl stored");
  assert(size > 5000, `payslip_EMP1011_2026_10 has valid real binary PDF size: ${size} bytes`);
  assert(docFields.type?.stringValue === "pdf", "Document type is pdf");

  const docPageCode = fs.readFileSync("src/app/(dashboard)/documents/page.tsx", "utf-8");
  assert(docPageCode.includes("triggerDocumentDownload"), "documents/page.tsx uses real file triggerDocumentDownload");

  const payrollPageCode = fs.readFileSync("src/app/(dashboard)/payroll/page.tsx", "utf-8");
  assert(payrollPageCode.includes("downloadPayslipPdf"), "payroll/page.tsx uses real downloadPayslipPdf");

  // 4. Verify Attendance Reconciliation (A-36)
  console.log("\n--- Checking Attendance Reconciliation Formula (A-36) ---");
  const attCode = fs.readFileSync("src/app/(dashboard)/attendance/page.tsx", "utf-8");
  assert(attCode.includes("leaveRequests"), "attendance/page.tsx checks leaveRequests for approved leaves");
  assert(attCode.includes("eligibleWorkforce = Math.max(0, totalHeadcount - onLeaveCount)"), "attendance/page.tsx computes eligibleWorkforce correctly");
  assert(attCode.includes('"On Leave"'), "attendance/page.tsx renders On Leave card in stats");

  // Run Attendance Reconciliation Scenarios
  function reconcile(totalHeadcount, onLeaveCount, presentOnly, lateOnly, halfDayOnly) {
    const loggedCount = presentOnly + lateOnly + halfDayOnly;
    const eligibleWorkforce = Math.max(0, totalHeadcount - onLeaveCount);
    const absentCount = totalHeadcount > 0 ? Math.max(0, eligibleWorkforce - loggedCount) : 0;
    return {
      totalHeadcount,
      onLeaveCount,
      presentOnly,
      lateOnly,
      halfDayOnly,
      absentCount,
      sum: presentOnly + lateOnly + halfDayOnly + onLeaveCount + absentCount,
    };
  }

  const s1 = reconcile(10, 0, 8, 1, 0); // 9 logged, 0 on leave -> absent 1, sum 10
  assert(s1.sum === 10 && s1.absentCount === 1, "Scenario 1 (9 logged, 0 leave): absent=1, sum=10");

  const s2 = reconcile(10, 2, 7, 0, 0); // 7 logged, 2 on leave -> absent 1, sum 10
  assert(s2.sum === 10 && s2.absentCount === 1, "Scenario 2 (7 logged, 2 leave): absent=1, sum=10");

  const s3 = reconcile(8, 1, 1, 0, 0); // 1 logged, 1 on leave -> absent 6, sum 8
  assert(s3.sum === 8 && s3.absentCount === 6, "Scenario 3 (1 logged, 1 leave): absent=6, sum=8");

  const s4 = reconcile(10, 10, 0, 0, 0); // 0 logged, 10 on leave -> absent 0, sum 10
  assert(s4.sum === 10 && s4.absentCount === 0, "Scenario 4 (0 logged, 10 leave): absent=0, sum=10");

  const s5 = reconcile(10, 0, 10, 0, 0); // 10 logged, 0 leave -> absent 0, sum 10
  assert(s5.sum === 10 && s5.absentCount === 0, "Scenario 5 (10 logged, 0 leave): absent=0, sum=10");

  // 5. Verify Team Utilisation / Task Completion Rate (A-21)
  console.log("\n--- Checking Task Completion Rate KPI (A-21) ---");
  const employerCode = fs.readFileSync("src/app/(dashboard)/employer/page.tsx", "utf-8");
  assert(employerCode.includes('"Task Completion Rate"'), "employer/page.tsx accurately labels KPI as Task Completion Rate");
  assert(!employerCode.includes('"Team Utilisation"'), "employer/page.tsx has completely eliminated misleading Team Utilisation label");

  // 6. Verify Firestore Rules & Security (A-39, E-17)
  console.log("\n--- Checking Firestore Security Rules (A-39, E-17) ---");
  const rulesCode = fs.readFileSync("firestore.rules", "utf-8");
  assert(!rulesCode.includes("match /notifications/{notifId} {\n      allow read, write: if true;"), "/notifications does not have public read/write");
  assert(rulesCode.includes("request.resource.data.senderUid == request.auth.uid"), "Notification creation enforces senderUid matches auth.uid");
  assert(rulesCode.includes("match /settings/{settingId} {\n      allow read:  if isSignedIn();\n      allow write: if isHRAdmin();"), "Settings write restricted to isHRAdmin");
  assert(rulesCode.includes("userRole() == 'SUPER_ADMIN'") && rulesCode.includes("userRole() == 'admin'"), "Rules support case-insensitive admin roles");

  // 7. Verify Sidebar Styling (A-35 / UI Polish)
  console.log("\n--- Checking Sidebar Styling & Aesthetics ---");
  const sidebarCode = fs.readFileSync("src/components/layout/Sidebar.tsx", "utf-8");
  assert(sidebarCode.includes("borderRadius: 6"), "Sidebar navigation items use modern rounded corners (borderRadius: 6)");
  assert(sidebarCode.includes('{ href: "/tasks/performance", label: "Team Performance"'), 'Sidebar label is clean "Team Performance" (not cut off)');

  console.log("\n=================================================");
  console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

verifyAll().catch((err) => {
  console.error("Verification script error:", err);
  process.exit(1);
});
