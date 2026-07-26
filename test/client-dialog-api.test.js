"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The child process may still be binding the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not become ready");
}

test("creates a dialog and exposes a client-safe status endpoint", async () => {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "malina-api-test-"));
  const port = 43000 + (process.pid % 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      APP_DATA_DIR: storageRoot,
      PORT: String(port),
      HOST: "127.0.0.1",
      TELEGRAM_BOT_TOKEN: ""
    },
    stdio: "ignore"
  });

  try {
    await waitForServer(baseUrl);
    const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
    assert.equal(health.storage, "json");
    assert.equal(health.storageHealthy, true);

    const createResponse = await fetch(`${baseUrl}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "browser-test-session",
        clientName: "Тестовый клиент",
        clientEmail: "client@example.com",
        topic: "Пакеты",
        message: "Нужен расчёт тиража",
        page: "/"
      })
    });
    assert.equal(createResponse.status, 200);
    const created = await createResponse.json();

    const statusResponse = await fetch(
      `${baseUrl}/api/leads/${encodeURIComponent(created.leadId)}/status`
    );
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();

    assert.equal(status.ok, true);
    assert.equal(status.leadId, created.leadId);
    assert.equal(status.leadNumber, created.leadNumber);
    assert.equal(status.status, "queued");
    assert.equal(status.queuePosition, 1);
    assert.equal("assignedManagerId" in status, false);
    assert.equal("clientEmail" in status, false);
  } finally {
    child.kill();
    fs.rmSync(storageRoot, { recursive: true, force: true });
  }
});
