import { spawn } from "node:child_process";
import fs from "node:fs";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("==================================================");
  console.log("  E2E REAL RESPONSIVE AUDIT (A-09, A-35, E-29)");
  console.log("==================================================");

  const chrome = spawn("google-chrome", [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--disable-gpu",
    "--no-sandbox",
    "--user-data-dir=/tmp/chrome-audit-profile-final"
  ]);

  await sleep(1500);

  try {
    const newTabRes = await fetch("http://localhost:9222/json/new?http://localhost:3001/login/admin", { method: "PUT" });
    const tabData = await newTabRes.json();
    const ws = new WebSocket(tabData.webSocketDebuggerUrl);

    let id = 1;
    const pending = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.method === "Runtime.consoleAPICalled") {
        const text = msg.params.args.map((a) => a.value || a.description).join(" ");
        if (text.includes("Error") || text.includes("error") || text.includes("auth")) {
          console.log("[BROWSER CONSOLE]", text);
        }
      }
      if (msg.id && pending.has(msg.id)) {
        const val = msg.result?.result?.value !== undefined ? msg.result.result.value : msg.result;
        pending.get(msg.id)(val);
        pending.delete(msg.id);
      }
    };

    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const msgId = id++;
        pending.set(msgId, resolve);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });

    await new Promise((r) => (ws.onopen = r));
    await send("Page.enable");
    await send("Runtime.enable");

    console.log("1. Submitting Admin Login form...");
    await sleep(2500);

    const submitResult = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          const email = document.getElementById("admin-email");
          const pass = document.getElementById("admin-password");
          nativeSetter.call(email, "admin_test@makewithus.in");
          email.dispatchEvent(new Event("input", { bubbles: true }));
          nativeSetter.call(pass, "admin123456");
          pass.dispatchEvent(new Event("input", { bubbles: true }));
          const btn = document.querySelector("button[type=submit]");
          btn.click();
          return "submitted";
        })()
      `,
      returnByValue: true
    });
    console.log("Login submit:", submitResult?.value);

    // Wait for redirect to /dashboard
    let loggedIn = false;
    for (let i = 0; i < 8; i++) {
      await sleep(1000);
      const urlEval = await send("Runtime.evaluate", {
        expression: "window.location.pathname",
        returnByValue: true
      });
      const pathname = urlEval?.value;
      if (pathname && !pathname.includes("/login")) {
        console.log(`Successfully logged in! Pathname: ${pathname}`);
        loggedIn = true;
        break;
      }
    }

    if (!loggedIn) {
      console.warn("Direct login took longer than expected; checking session cookies...");
    }

    // ──────────────────────────────────────────────────────────
    // A-09 AUDIT: Tasks page Assign Task button at ~600px width
    // ──────────────────────────────────────────────────────────
    console.log("\n2. [A-09 AUDIT] Testing /tasks at 600px window width...");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await send("Page.navigate", { url: "http://localhost:3001/tasks" });
    await sleep(3500);

    const assignBtnMetrics = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const btn = document.getElementById("task-assign-btn") || Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Assign Task") || b.textContent.includes("New Task"));
          if (!btn) return { found: false, reason: "Button element not found in DOM" };
          const rect = btn.getBoundingClientRect();
          const style = window.getComputedStyle(btn);
          return {
            found: true,
            text: btn.textContent.trim(),
            visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden",
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
          };
        })()
      `,
      returnByValue: true
    });
    console.log("Assign Task button check at 600px:", JSON.stringify(assignBtnMetrics?.value, null, 2));

    // Capture screenshot of Tasks at 600px
    const ss1 = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      "/home/krrish/.gemini/antigravity/brain/35ad98e0-d99e-4a77-93de-d0826e8c7c63/screenshot_tasks_600px.png",
      Buffer.from(ss1.data, "base64")
    );
    console.log("Captured: screenshot_tasks_600px.png");

    // Click the Assign Task button to open modal
    console.log("Clicking Assign Task button at 600px...");
    const clickModal = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const btn = document.getElementById("task-assign-btn") || Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Assign Task") || b.textContent.includes("New Task"));
          if (btn) { btn.click(); return "clicked"; }
          return "not_found";
        })()
      `,
      returnByValue: true
    });
    console.log("Click modal result:", clickModal?.value);
    await sleep(1500);

    const modalMetrics = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const modal = document.querySelector(".card[style*='maxWidth']") || document.querySelector("div[style*='position: fixed']");
          if (!modal) return { open: false };
          return {
            open: true,
            title: document.querySelector(".card")?.textContent?.slice(0, 50)?.replace(/\\n/g, ' '),
            scrollable: modal.scrollHeight > modal.clientHeight || window.getComputedStyle(modal).overflowY === "auto"
          };
        })()
      `,
      returnByValue: true
    });
    console.log("Task modal at 600px:", JSON.stringify(modalMetrics?.value, null, 2));

    const ssModal = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      "/home/krrish/.gemini/antigravity/brain/35ad98e0-d99e-4a77-93de-d0826e8c7c63/screenshot_task_modal_600px.png",
      Buffer.from(ssModal.data, "base64")
    );
    console.log("Captured: screenshot_task_modal_600px.png");

    // ──────────────────────────────────────────────────────────
    // A-35 AUDIT: Team Performance page at 375px mobile width
    // ──────────────────────────────────────────────────────────
    console.log("\n3. [A-35 AUDIT] Testing /tasks/performance at 375px mobile width...");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });
    await send("Page.navigate", { url: "http://localhost:3001/tasks/performance" });
    await sleep(3500);

    const perfMetrics = await send("Runtime.evaluate", {
      expression: `
        (() => {
          return {
            viewportWidth: window.innerWidth,
            bodyScrollWidth: document.body.scrollWidth,
            hasHorizontalExplosion: document.body.scrollWidth > 420,
            title: document.querySelector("h1, h2")?.textContent?.trim()
          };
        })()
      `,
      returnByValue: true
    });
    console.log("Performance mobile metrics at 375px:", JSON.stringify(perfMetrics?.value, null, 2));

    const ss2 = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      "/home/krrish/.gemini/antigravity/brain/35ad98e0-d99e-4a77-93de-d0826e8c7c63/screenshot_performance_375px.png",
      Buffer.from(ss2.data, "base64")
    );
    console.log("Captured: screenshot_performance_375px.png");

    // ──────────────────────────────────────────────────────────
    // E-29 AUDIT: Clock In / Continue Work at ~600px width
    // ──────────────────────────────────────────────────────────
    console.log("\n4. [E-29 AUDIT] Testing /dashboard Clock In / Continue Work at 600px width...");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await send("Page.navigate", { url: "http://localhost:3001/dashboard" });
    await sleep(3500);

    const clockInMetrics = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const btn = document.getElementById("clock-in-btn") || Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Clock In") || b.textContent.includes("Continue Work") || b.textContent.includes("Take Break"));
          if (!btn) return { found: false, reason: "Button not found" };
          const rect = btn.getBoundingClientRect();
          const style = window.getComputedStyle(btn);
          return {
            found: true,
            text: btn.textContent.trim(),
            visible: rect.width > 0 && rect.height > 0 && style.display !== "none",
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
          };
        })()
      `,
      returnByValue: true
    });
    console.log("Clock In / Work button check at 600px:", JSON.stringify(clockInMetrics?.value, null, 2));

    const ss3 = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      "/home/krrish/.gemini/antigravity/brain/35ad98e0-d99e-4a77-93de-d0826e8c7c63/screenshot_employee_dashboard_600px.png",
      Buffer.from(ss3.data, "base64")
    );
    console.log("Captured: screenshot_employee_dashboard_600px.png");

    ws.close();
  } finally {
    chrome.kill();
  }
}

run().catch(console.error);
