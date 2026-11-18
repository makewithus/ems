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
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/employees`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const docs = data.documents || [];

  console.log(`Inspecting ${docs.length} employee documents for plaintext passwords...`);
  let purgedCount = 0;

  for (const doc of docs) {
    const docId = doc.name.split("/").pop();
    const fields = doc.fields || {};
    if (fields.password) {
      console.log(`Found password field in document ${docId} (EMP ID: ${fields.employeeId?.stringValue})`);
      // Update doc with mask update: exclude password field
      // Firestore REST API patch with updateMask
      // To delete a field in Firestore REST API, we omit it from fields and don't include it, or use documentTransform / FieldValue.delete
      // In REST API, patching with updateMask.fieldPaths for all OTHER fields, or simply updating all fields except password
      // In Firestore REST API, if updateMask does NOT include 'password', but we want to remove 'password':
      // Actually in Firestore REST API, setting updateMask.fieldPaths to only the fields we keep does NOT delete omitted fields.
      // To delete a field, updateMask.fieldPaths MUST include 'password', but doc.fields must NOT have 'password'!
      
      const newFields = { ...fields };
      delete newFields.password;

      // When updateMask includes a field path that is NOT in the document body, Firestore DELETES that field!
      const patchUrl = `https://firestore.googleapis.com/v1/${doc.name}?updateMask.fieldPaths=password`;
      const patchRes = await fetch(patchUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: {} }), // empty body deletes fields in updateMask
      });

      if (patchRes.ok) {
        console.log(`Successfully purged password from ${docId}`);
        purgedCount++;
      } else {
        const errText = await patchRes.text();
        console.error(`Failed to purge password from ${docId}:`, errText);
      }
    }
  }

  console.log(`Done! Purged password field from ${purgedCount} employee documents.`);
}

run().catch(console.error);

