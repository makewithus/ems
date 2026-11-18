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

async function run() {
  console.log("Getting token...");
  const token = await getAccessToken();
  console.log("Token acquired!");

  // List employees
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/employees`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  console.log(`Employees count: ${data.documents ? data.documents.length : 0}`);
  if (data.documents) {
    data.documents.forEach((doc) => {
      const f = doc.fields;
      const name = `${f?.firstName?.stringValue || ""} ${f?.lastName?.stringValue || ""}`.trim();
      const empId = f?.employeeId?.stringValue;
      const status = f?.status?.stringValue;
      const desig = f?.designation?.stringValue;
      const salDate = f?.salaryDate?.stringValue || f?.salaryDate?.integerValue;
      console.log(`- [${empId}] ${name} | Status: ${status} | Designation: ${desig} | SalaryDate: ${salDate}`);
    });
  }
}

run().catch(console.error);

