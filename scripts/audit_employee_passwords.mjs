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

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsignedToken = `${b64(header)}.${b64(claim)}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsignedToken);
  const signature = sign.sign(env.FIREBASE_PRIVATE_KEY, "base64url");
  const jwt = `${unsignedToken}.${signature}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  return (await res.json()).access_token;
}

async function check() {
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/employees`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  console.log("Total employee docs:", data.documents?.length || 0);
  const withPassword = [];
  data.documents?.forEach(d => {
    const f = d.fields;
    const empId = f?.employeeId?.stringValue;
    const hasPass = f?.password !== undefined;
    if (hasPass) withPassword.push({ empId, docPath: d.name, docId: d.name.split("/").pop() });
  });
  console.log("Documents with plaintext password field:", withPassword.length);
  withPassword.forEach(w => console.log(`- ${w.empId} in docId: ${w.docId}`));
}

check().catch(console.error);

