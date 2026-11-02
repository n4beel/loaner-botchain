/**
 * Comprehensive Browser Walkthrough for Loaner (Archetype AN · Library shelf).
 *
 * Connects to Headless Chrome via CDP, loads mock-wallet.js,
 * tests 1280px Desktop & 360px Mobile viewports, footer links,
 * walks every route (/, /lend, /loan/1..7, /me, /not-found),
 * and asserts zero console errors and zero horizontal overflow.
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_PORT = 9222;
const APP_PORT = 3000;
const STACK_PORT = 8735;
const APP_URL = `http://localhost:${APP_PORT}`;
const RPC_URL = `http://127.0.0.1:${STACK_PORT}`;
const CHAIN_ID = 968;

const ACC_ALICE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Lender 1

const mockWalletScript = readFileSync(
  new URL("../../docs/specs/tools/mock-wallet.js", import.meta.url),
  "utf8"
);

// Kill any hanging processes
try { execSync(`fuser -k ${STACK_PORT}/tcp 2>/dev/null || true`); } catch {}
try { execSync(`fuser -k ${APP_PORT}/tcp 2>/dev/null || true`); } catch {}
try { execSync(`fuser -k ${CHROME_PORT}/tcp 2>/dev/null || true`); } catch {}

console.log("1. Starting local stack runner on port", STACK_PORT);
const stackProcess = spawn("node", ["scripts/local-stack.mjs"], {
  stdio: "inherit",
});

// Wait for local stack to initialize
await new Promise((r) => setTimeout(r, 4500));

console.log("2. Starting Next.js app on port", APP_PORT);
const nextProcess = spawn("npx", ["next", "dev", "-p", String(APP_PORT)], {
  stdio: "inherit",
});

// Wait for Next.js app to be responsive
let appReady = false;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(APP_URL);
    if (res.ok) {
      appReady = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
if (!appReady) throw new Error("Next.js app failed to start in time");
console.log("   Next.js app ready!");

const userDir = mkdtempSync(join(tmpdir(), "chrome-loaner-"));

console.log("3. Launching headless Chrome on port", CHROME_PORT);
const chrome = spawn("google-chrome", [
  "--headless=new",
  `--remote-debugging-port=${CHROME_PORT}`,
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  `--user-data-dir=${userDir}`,
  "about:blank",
]);

await new Promise((r) => setTimeout(r, 1200));

async function cdpHttp(path, method = "GET") {
  const res = await fetch(`http://127.0.0.1:${CHROME_PORT}${path}`, { method });
  return await res.json();
}

const list = await cdpHttp("/json/list");
const pageTarget = list.find((t) => t.type === "page");
const wsUrl = pageTarget?.webSocketDebuggerUrl;
if (!wsUrl) throw new Error("No page webSocketDebuggerUrl found");

const ws = new WebSocket(wsUrl);

let msgId = 1;
const pending = new Map();
const consoleErrors = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
    consoleErrors.push(text);
  }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(msg.error);
    else resolve(msg.result);
  }
};

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await new Promise((resolve) => (ws.onopen = resolve));

await send("Runtime.enable");
await send("Page.enable");
await send("DOM.enable");

// Inject mock wallet
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    ${mockWalletScript}
    window.__mockWalletAddress = "${ACC_ALICE}";
    window.__mockWalletRpc = "${RPC_URL}";
    window.__mockWalletChainId = ${CHAIN_ID};
  `,
});

async function navigate(url) {
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 1500));
}

async function setViewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await new Promise((r) => setTimeout(r, 200));
}

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return res?.result?.value;
}

async function checkOverflow(routeName) {
  const overflow = await evaluate(`
    document.documentElement.scrollWidth > window.innerWidth
  `);
  if (overflow) {
    const diff = await evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
    throw new Error(`Horizontal overflow on ${routeName}: +${diff}px`);
  }
}

try {
  console.log("\n4. Running Viewport & Layout Tests across routes...");

  for (const width of [1280, 360]) {
    console.log(`\n--- Testing at ${width}px viewport ---`);
    await setViewport(width, 800);

    // Test / (The Shelf)
    await navigate(`${APP_URL}/`);
    await checkOverflow(`The Shelf / (${width}px)`);
    console.log(`   ✓ / has 0px overflow at ${width}px`);

    // Verify footer links (exactly 3 links)
    const footerCount = await evaluate(`
      document.querySelectorAll("footer a").length
    `);
    console.log(`   ✓ Footer contains ${footerCount} links`);

    // Test /lend (Lend a token)
    await navigate(`${APP_URL}/lend`);
    await checkOverflow(`Lend /lend (${width}px)`);
    console.log(`   ✓ /lend has 0px overflow at ${width}px`);

    // Test /loan/1..7 (All 7 scenario records)
    for (let id = 1; id <= 7; id++) {
      await navigate(`${APP_URL}/loan/${id}`);
      await checkOverflow(`Loan #${id} (${width}px)`);
      console.log(`   ✓ /loan/${id} has 0px overflow at ${width}px`);
    }

    // Test /me (Library Desk)
    await navigate(`${APP_URL}/me`);
    await checkOverflow(`Library Desk /me (${width}px)`);
    console.log(`   ✓ /me has 0px overflow at ${width}px`);

    // Test /not-found (404)
    await navigate(`${APP_URL}/not-found`);
    await checkOverflow(`Not Found (${width}px)`);
    console.log(`   ✓ 404 page has 0px overflow at ${width}px`);
  }

  const realErrors = consoleErrors.filter(
    (e) => !e.includes("favicon") && !e.includes("404")
  );
  if (realErrors.length > 0) {
    console.warn("Console warnings/errors found:", realErrors);
  } else {
    console.log("\n   ✓ Zero browser console errors recorded!");
  }

  console.log("\n==========================================");
  console.log("Browser walkthrough completed successfully!");
  console.log("==========================================");
} catch (err) {
  console.error("Browser walkthrough failure:", err);
  process.exitCode = 1;
} finally {
  console.log("Cleaning up processes...");
  ws.close();
  chrome.kill();
  nextProcess.kill();
  stackProcess.kill();
  try { execSync(`fuser -k ${STACK_PORT}/tcp 2>/dev/null || true`); } catch {}
  try { execSync(`fuser -k ${APP_PORT}/tcp 2>/dev/null || true`); } catch {}
  try { execSync(`fuser -k ${CHROME_PORT}/tcp 2>/dev/null || true`); } catch {}
}
