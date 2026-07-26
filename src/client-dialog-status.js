"use strict";

const statusLabels = {
  new: "обращение принято",
  active: "менеджер подключён",
  queued: "ожидает менеджера",
  closed: "диалог завершён"
};

function getQueuePosition(dialog, dialogs) {
  if (!dialog || dialog.status !== "queued") {
    return null;
  }

  const queue = dialogs
    .filter((item) => item.status === "queued")
    .sort((left, right) => {
      const byTime = String(left.queuedAt || "").localeCompare(String(right.queuedAt || ""));
      return byTime || Number(left.number || 0) - Number(right.number || 0);
    });
  const index = queue.findIndex((item) => item.id === dialog.id);

  return index >= 0 ? index + 1 : null;
}

function createClientDialogStatus(dialog, dialogs) {
  return {
    leadId: dialog.id,
    leadNumber: dialog.number,
    status: dialog.status,
    statusLabel: statusLabels[dialog.status] || "статус уточняется",
    queuePosition: getQueuePosition(dialog, dialogs),
    updatedAt: dialog.updatedAt || dialog.createdAt || "",
    pollAfterMs: dialog.status === "closed" ? 0 : dialog.status === "queued" ? 5000 : 3000
  };
}

module.exports = {
  createClientDialogStatus,
  getQueuePosition
};
