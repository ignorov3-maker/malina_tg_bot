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
      TELEGRAM_BOT_TOKEN: "",
      LEAD_RATE_LIMIT_MAX: "3"
    },
    stdio: "ignore"
  });

  try {
    await waitForServer(baseUrl);
    const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
    assert.equal(health.storage, "json");
    assert.equal(health.storageHealthy, true);

    const withoutConsentResponse = await fetch(`${baseUrl}/api/leads`, {
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
    assert.equal(withoutConsentResponse.status, 400);

    const createResponse = await fetch(`${baseUrl}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "browser-test-session",
        clientName: "Тестовый клиент",
        clientPhone: "+7 978 123-45-67",
        topic: "Пакеты",
        message: "Нужен расчёт тиража",
        page: "/",
        brief: { quantity: "500 шт.", city: "Севастополь", deadline: "до пятницы" },
        consent: {
          accepted: true,
          version: "2026-08-17",
          acceptedAt: "2026-08-17T10:00:00.000Z"
        }
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

    const invalidAttachmentResponse = await fetch(`${baseUrl}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "browser-test-session",
        leadId: created.leadId,
        message: "Проверка файла",
        attachments: [{ name: "fake.pdf", data: Buffer.from("not a pdf").toString("base64") }]
      })
    });
    assert.equal(invalidAttachmentResponse.status, 400);

    const limitedResponse = await fetch(`${baseUrl}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "browser-test-session",
        leadId: created.leadId,
        message: "Лишнее сообщение"
      })
    });
    assert.equal(limitedResponse.status, 429);
    assert.ok(Number(limitedResponse.headers.get("retry-after")) >= 1);

    const stored = JSON.parse(fs.readFileSync(path.join(storageRoot, "data", "leads.json"), "utf8"));
    assert.equal(stored.leads[0].consent.accepted, true);
    assert.equal(stored.leads[0].consent.version, "2026-08-17");
    assert.equal(stored.leads[0].brief.quantity, "500 шт.");
    assert.equal(stored.leads[0].brief.city, "Севастополь");
    assert.equal(stored.leads[0].clientPhone, "+7 978 123-45-67");
  } finally {
    child.kill();
    fs.rmSync(storageRoot, { recursive: true, force: true });
  }
});
