import { spawn } from "node:child_process";
import fs from "node:fs";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function capture() {
  console.log("Launching headless chrome on port 9222...");
  const chrome = spawn("google-chrome", [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--disable-gpu",
    "--no-sandbox",
    "--user-data-dir=/tmp/chrome-audit-profile-2"
  ]);

  await sleep(1500);

  try {
    const verRes = await fetch("http://localhost:9222/json/version");
    const verData = await verRes.json();
    console.log("Connected to browser:", verData.Browser);

    const newTabRes = await fetch("http://localhost:9222/json/new?http://localhost:3001/login/admin", { method: "PUT" });
    const tabData = await newTabRes.json();
    const wsUrl = tabData.webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await new Promise((resolve) => ws.onopen = resolve);
    console.log("WebSocket connected!");

    await send("Page.enable");
    await send("Runtime.enable");

    // Wait for login page to load
    await sleep(2500);

    console.log("Logging in as admin...");
    const loginEval = await send("Runtime.evaluate", {
      expression: `
        (async () => {
          const emailInput = document.getElementById("admin-email");
          const passInput = document.getElementById("admin-password");
          if (!emailInput || !passInput) return "no_inputs";
          
          emailInput.value = "admin_test@makewithus.in";
          emailInput.dispatchEvent(new Event("input", { bubbles: true }));
          emailInput.dispatchEvent(new Event("change", { bubbles: true }));

          passInput.value = "admin123456";
          passInput.dispatchEvent(new Event("input", { bubbles: true }));
          passInput.dispatchEvent(new Event("change", { bubbles: true }));

          const submitBtn = document.querySelector("button[type='submit']");
          if (!submitBtn) return "no_submit";
          submitBtn.click();
          return "clicked";
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log("Login form action result:", loginEval.value);

    // Wait for auth & redirect to complete
    await sleep(4000);

    const currentUrl = await send("Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true,
    });
    console.log("Current URL after login:", currentUrl.value);

    // TEST 1: Tasks page at 600px width (A-09)
    console.log("Navigating to /tasks with 600px viewport...");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: "http://localhost:3001/tasks" });
    await sleep(3500);

    // Check Assign Task button
    const assignBtnCheck = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const btn = document.getElementById("task-assign-btn") || Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Assign Task") || b.textContent.includes("New Task"));
          if (!btn) return { found: false };
          const rect = btn.getBoundingClientRect();
          return {
            found: true,
            text: btn.textContent.trim(),
            visible: rect.width > 0 && rect.height > 0,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        })()
      `,
      returnByValue: true,
    });
    console.log("Assign Task Button at 600px:", JSON.stringify(assignBtnCheck.value));

    // Capture screenshot of Tasks page at 600px
    const ss1 = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("/home/krrish/.gemini/antigravity/brain/35ad98e0-d99e-4a77-93de-d0826e8c7c63/screenshot_tasks_600px.png", Buffer.from(ss1.data, "base64"));
    console.log("Saved screenshot_tasks_600px.png");

    // Click Assign Task button to open modal at 600px
    console.log("Clicking Assign Task button to test modal at 600px...");
    await send("Runtime.evaluate", {
      expression: `
        (() => {
          const btn = document.getElementById("task-assign-btn") || Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Assign Task") || b.textContent.includes("New Task"));
          if (btn) btn.click();
        })()
      `,
    });
    await sleep(1000);

    const ssModal = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("/home/krrish/.gemini/antigravity/brain/35ad98e0-d99e-4a77-93de-d0826e8c7c63/screenshot_task_modal_600px.png", Buffer.from(ssModal.data, "base64"));
    console.log("Saved screenshot_task_modal_600px.png");

    // TEST 2: Team Performance page at 375px width (A-35)
    console.log("Navigating to /tasks/performance with 375px viewport (A-35)...");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await send("Page.navigate", { url: "http://localhost:3001/tasks/performance" });
    await sleep(3500);

    const ss2 = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("/home/krrish/.gemini/antigravity/brain/35ad98e0-d99e-4a77-93de-d0826e8c7c63/screenshot_performance_375px.png", Buffer.from(ss2.data, "base64"));
    console.log("Saved screenshot_performance_375px.png");

    // TEST 3: Employee Dashboard Clock In at 600px (E-29)
    console.log("Navigating to /dashboard at 600px width (E-29)...");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: "http://localhost:3001/dashboard" });
    await sleep(3500);

    const clockInCheck = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const btn = document.getElementById("clock-in-btn") || Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Clock In") || b.textContent.includes("Continue Work") || b.textContent.includes("Take Break"));
          if (!btn) return { found: false };
          const rect = btn.getBoundingClientRect();
          return {
            found: true,
            text: btn.textContent.trim(),
            visible: rect.width > 0 && rect.height > 0,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        })()
      `,
      returnByValue: true,
    });
    console.log("Clock In / Work Button at 600px:", JSON.stringify(clockInCheck.value));

    const ss3 = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("/home/krrish/.gemini/antigravity/brain/35ad98e0-d99e-4a77-93de-d0826e8c7c63/screenshot_employee_dashboard_600px.png", Buffer.from(ss3.data, "base64"));
    console.log("Saved screenshot_employee_dashboard_600px.png");

    ws.close();
  } finally {
    chrome.kill();
  }
}

capture().catch(console.error);
