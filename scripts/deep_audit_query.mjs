import crypto from "node:crypto";
import fs from "node:fs";

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
  return data.access_token;
}

function parseFirestoreFields(fields) {
  if (!fields) return {};
  const res = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v.stringValue !== undefined) res[k] = v.stringValue;
    else if (v.integerValue !== undefined) res[k] = Number(v.integerValue);
    else if (v.doubleValue !== undefined) res[k] = Number(v.doubleValue);
    else if (v.booleanValue !== undefined) res[k] = v.booleanValue;
    else if (v.timestampValue !== undefined) res[k] = v.timestampValue;
    else if (v.nullValue !== undefined) res[k] = null;
    else if (v.arrayValue !== undefined) {
      res[k] = (v.arrayValue.values || []).map(val => parseFirestoreFields({ item: val }).item);
    } else if (v.mapValue !== undefined) {
      res[k] = parseFirestoreFields(v.mapValue.fields);
    } else {
      res[k] = v;
    }
  }
  return res;
}

async function run() {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  console.log("=== 1. EMP1006 CHECK ===");
  const empRes = await fetch(`${baseUrl}/employees`, { headers });
  const empData = await empRes.json();
  const empDocs = (empData.documents || []).map(d => ({
    path: d.name,
    id: d.name.split("/").pop(),
    ...parseFirestoreFields(d.fields)
  }));
  const emp1006 = empDocs.find(e => e.employeeId === "EMP1006");
  console.log("EMP1006 Doc:", JSON.stringify(emp1006, null, 2));

  console.log("\n=== 2. TASKS FOR EMP1006 & TOTAL TASKS ===");
  const taskRes = await fetch(`${baseUrl}/tasks`, { headers });
  const taskData = await taskRes.json();
  const taskDocs = (taskData.documents || []).map(d => ({
    id: d.name.split("/").pop(),
    ...parseFirestoreFields(d.fields)
  }));
  console.log(`Total Tasks in DB: ${taskDocs.length}`);
  const tasksFor1006 = taskDocs.filter(t => t.assigneeId === "EMP1006" || t.assignedTo === "EMP1006" || t.assigneeName?.includes("test er"));
  console.log(`Tasks for EMP1006 (${tasksFor1006.length}):`, tasksFor1006.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })));

  console.log("\n=== 3. PAYROLL RECORDS ===");
  const payRes = await fetch(`${baseUrl}/payroll`, { headers });
  const payData = await payRes.json();
  const payDocs = (payData.documents || []).map(d => ({
    id: d.name.split("/").pop(),
    ...parseFirestoreFields(d.fields)
  }));
  console.log(`Total Payroll records: ${payDocs.length}`);
  payDocs.forEach(p => {
    console.log(`- ID: ${p.id} | Emp: ${p.employeeName} (${p.employeeId}) | Month: ${p.month}/${p.year} | Basic: ${p.basic} | Allowances: ${p.allowances} | Gross: ${p.gross} | PF: ${p.pf} | Tax: ${p.tax} | Deductions: ${p.deductions} | Net: ${p.net} | Status: ${p.status}`);
  });

  console.log("\n=== 4. DOCUMENTS COLLECTION (PAYSLIP PDFs) ===");
  const docRes = await fetch(`${baseUrl}/documents`, { headers });
  const docData = await docRes.json();
  const docDocs = (docData.documents || []).map(d => ({
    id: d.name.split("/").pop(),
    ...parseFirestoreFields(d.fields)
  }));
  console.log(`Total Documents: ${docDocs.length}`);
  docDocs.forEach(d => {
    console.log(`- ID: ${d.id} | Name: ${d.name} | Type: ${d.type} | FolderId: ${d.folderId} | URL: ${d.url || d.fileUrl || "(no url)"}`);
  });

  console.log("\n=== 5. NOTICES & PRIORITY VALUES ===");
  const notRes = await fetch(`${baseUrl}/notices`, { headers });
  const notData = await notRes.json();
  const notDocs = (notData.documents || []).map(d => ({
    id: d.name.split("/").pop(),
    ...parseFirestoreFields(d.fields)
  }));
  console.log(`Total Notices: ${notDocs.length}`);
  const prioritiesSeen = new Set();
  notDocs.forEach(n => {
    prioritiesSeen.add(n.priority);
    console.log(`- Notice: "${n.title}" | Priority: "${n.priority}" | Date: ${n.date} | Expiry: ${n.expiry}`);
  });
  console.log("Distinct priorities in notices:", Array.from(prioritiesSeen));

  console.log("\n=== 6. ATTENDANCE RECORDS ===");
  const attRes = await fetch(`${baseUrl}/attendance`, { headers });
  const attData = await attRes.json();
  const attDocs = (attData.documents || []).map(d => ({
    id: d.name.split("/").pop(),
    ...parseFirestoreFields(d.fields)
  }));
  console.log(`Total Attendance records: ${attDocs.length}`);
  attDocs.slice(0, 10).forEach(a => {
    console.log(`- Doc: ${a.id} | EmpId: ${a.employeeId} | Date: ${a.date} | In: ${a.clockIn} | Out: ${a.clockOut} | Break: ${a.breakStart}-${a.breakEnd} | Hours: ${a.hoursWorked} | Status: ${a.status}`);
  });
}

run().catch(console.error);

