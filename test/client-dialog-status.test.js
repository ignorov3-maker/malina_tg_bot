"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createClientDialogStatus,
  getQueuePosition
} = require("../src/client-dialog-status");

const dialogs = [
  { id: "active-1", number: 1, status: "active", updatedAt: "2026-07-26T10:00:00.000Z" },
  { id: "queued-2", number: 2, status: "queued", queuedAt: "2026-07-26T10:02:00.000Z" },
  { id: "queued-3", number: 3, status: "queued", queuedAt: "2026-07-26T10:03:00.000Z" }
];

test("returns FIFO position only for queued dialogs", () => {
  assert.equal(getQueuePosition(dialogs[1], dialogs), 1);
  assert.equal(getQueuePosition(dialogs[2], dialogs), 2);
  assert.equal(getQueuePosition(dialogs[0], dialogs), null);
});

test("exposes only client-safe status data", () => {
  const status = createClientDialogStatus(
    {
      ...dialogs[1],
      assignedManagerId: "123456789",
      clientEmail: "hidden@example.com"
    },
    dialogs
  );

  assert.deepEqual(status, {
    leadId: "queued-2",
    leadNumber: 2,
    status: "queued",
    statusLabel: "ожидает менеджера",
    queuePosition: 1,
    updatedAt: "",
    pollAfterMs: 5000
  });
  assert.equal("assignedManagerId" in status, false);
  assert.equal("clientEmail" in status, false);
});
