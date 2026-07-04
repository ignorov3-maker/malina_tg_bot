const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const root = __dirname;
const envPath = path.join(root, ".env");

loadDotEnv();

const storageRoot = process.env.APP_DATA_DIR ? path.resolve(process.env.APP_DATA_DIR) : root;
const dataDir = path.join(storageRoot, "data");
const managersPath = path.join(storageRoot, "managers.json");
const pendingManagersPath = path.join(storageRoot, "pending-managers.json");
const dialogsPath = path.join(dataDir, "leads.json");

ensureStorage();

const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "127.0.0.1";
const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
const adminApproveToken = process.env.ADMIN_APPROVE_TOKEN || "";
const botApi = botToken ? `https://api.telegram.org/bot${botToken}` : "";
const publicFiles = new Set(["/index.html", "/styles.css", "/script.js"]);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

let telegramOffset = 0;

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      const store = readDialogStore();
      return sendJson(response, 200, {
        ok: true,
        botConfigured: Boolean(botToken),
        managers: getManagers().length,
        pendingManagers: readPendingManagers().pending.length,
        activeDialogs: store.leads.filter((dialog) => dialog.status === "active").length,
        queuedDialogs: store.leads.filter((dialog) => dialog.status === "queued").length
      });
    }

    if (request.method === "POST" && url.pathname === "/api/leads") {
      return handleClientMessage(request, response);
    }

    const messagesMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/messages$/);
    if (request.method === "GET" && messagesMatch) {
      return handleDialogMessages(response, messagesMatch[1]);
    }

    if (request.method === "GET" && url.pathname === "/api/managers") {
      return sendJson(response, 200, {
        managers: getManagers(),
        pending: readPendingManagers().pending
      });
    }

    if (request.method === "GET" && url.pathname === "/api/managers/pending") {
      return sendJson(response, 200, readPendingManagers());
    }

    if (request.method === "POST" && url.pathname === "/api/managers/approve") {
      return handleApproveManager(request, response);
    }

    if (request.method === "GET") {
      return serveStatic(url.pathname, response);
    }

    return sendJson(response, 405, { ok: false, message: "Method not allowed" });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { ok: false, message: "Server error" });
  }
});

server.listen(port, host, () => {
  console.log(`Malina prototype is running: http://${host}:${port}/`);
  console.log(`Telegram bot: ${botToken ? "configured" : "missing TELEGRAM_BOT_TOKEN"}`);
  console.log(`Managers configured: ${getManagers().length}`);

  if (botToken) {
    startTelegramPolling();
  }
});

async function handleClientMessage(request, response) {
  const payload = await readJson(request);
  const sessionId = cleanText(payload.sessionId || "");
  const requestedDialogId = cleanText(payload.leadId || "");
  const topic = cleanText(payload.product || "Не выбрана");
  const page = cleanText(payload.page || "");
  const text = cleanText(payload.message || "");

  if (!sessionId || !text) {
    return sendJson(response, 400, {
      ok: false,
      message: "Нужно передать sessionId и сообщение"
    });
  }

  const store = readDialogStore();
  const result = getOrCreateOpenDialog(store, {
    requestedDialogId,
    sessionId,
    topic,
    page
  });
  const dialog = result.dialog;

  dialog.topic = topic || dialog.topic;
  dialog.page = page || dialog.page;
  dialog.updatedAt = nowIso();
  dialog.lastClientAt = dialog.updatedAt;
  dialog.messages.push(createMessage("client", text));

  let event = "message_saved";
  let sentToManagers = 0;

  if (dialog.status === "active" && dialog.assignedManagerId) {
    writeDialogStore(store);
    sentToManagers = await notifyAssignedManager(dialog, text, result.isNew ? "new" : "continuation");
    event = result.isNew ? "dialog_started" : "message_delivered";
  } else if (dialog.status === "queued") {
    writeDialogStore(store);
    event = result.isNew ? "queued" : "queued_updated";
  } else {
    const manager = botToken ? getFreeManager(store) : null;

    if (manager) {
      assignDialog(dialog, manager.id);
      writeDialogStore(store);
      sentToManagers = await notifyAssignedManager(dialog, text, "new");

      if (sentToManagers > 0) {
        event = "dialog_started";
      } else {
        queueDialog(dialog);
        dialog.assignedManagerId = "";
        dialog.assignedAt = "";
        writeDialogStore(store);
        event = "queued";
      }
    } else {
      queueDialog(dialog);
      writeDialogStore(store);
      event = !botToken || getManagers().length === 0 ? "no_managers" : "queued";
    }
  }

  return sendJson(response, 200, {
    ok: true,
    leadId: dialog.id,
    leadNumber: dialog.number,
    status: dialog.status,
    queued: dialog.status === "queued",
    assignedManagerId: dialog.assignedManagerId || "",
    sentToManagers,
    event
  });
}

function handleDialogMessages(response, dialogId) {
  const store = readDialogStore();
  const dialog = store.leads.find((item) => item.id === decodeURIComponent(dialogId));

  if (!dialog) {
    return sendJson(response, 404, { ok: false, message: "Диалог не найден" });
  }

  return sendJson(response, 200, {
    ok: true,
    leadId: dialog.id,
    leadNumber: dialog.number,
    status: dialog.status,
    assignedManagerId: dialog.assignedManagerId || "",
    messages: dialog.messages
  });
}

async function handleApproveManager(request, response) {
  if (!isAdminRequest(request)) {
    return sendJson(response, 401, { ok: false, message: "Admin token is required" });
  }

  const payload = await readJson(request);
  const id = cleanText(payload.id || "");
  const pendingStore = readPendingManagers();
  const pendingManager = pendingStore.pending.find((manager) => String(manager.id) === id);
  const name = cleanText(payload.name || pendingManager?.name || pendingManager?.username || "Менеджер");
  const username = cleanText(payload.username || pendingManager?.username || "");

  if (!id) {
    return sendJson(response, 400, { ok: false, message: "Нужно передать id" });
  }

  const managerStore = readManagersStore();
  const exists = managerStore.managers.some((manager) => String(manager.id) === id);

  if (!exists) {
    managerStore.managers.push({ id, name, username, enabled: true });
    writeManagersStore(managerStore);
  }

  pendingStore.pending = pendingStore.pending.filter((manager) => String(manager.id) !== id);
  writePendingManagers(pendingStore);

  if (botToken) {
    await telegram("sendMessage", {
      chat_id: id,
      text: "Готово, вы добавлены как менеджер. Когда появится свободный диалог, я пришлю его сюда."
    }).catch((error) => console.error("Approve notification failed:", error.message));
  }

  return sendJson(response, 200, { ok: true, managers: managerStore.managers.length });
}

function getOrCreateOpenDialog(store, options) {
  const byRequestedId = options.requestedDialogId
    ? store.leads.find((dialog) => dialog.id === options.requestedDialogId && dialog.status !== "closed")
    : null;
  const bySession = store.leads.find(
    (dialog) => dialog.sessionId === options.sessionId && dialog.status !== "closed"
  );
  const existing = byRequestedId || bySession;

  if (existing) {
    return { dialog: existing, isNew: false };
  }

  store.counter += 1;
  const createdAt = nowIso();
  const dialog = {
    id: `dialog_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    number: store.counter,
    sessionId: options.sessionId,
    status: "new",
    topic: options.topic,
    page: options.page,
    assignedManagerId: "",
    assignedAt: "",
    queuedAt: "",
    closedAt: "",
    createdAt,
    updatedAt: createdAt,
    lastClientAt: "",
    messages: [],
    telegramMessages: {}
  };

  store.leads.push(dialog);
  return { dialog, isNew: true };
}

function assignDialog(dialog, managerId) {
  dialog.status = "active";
  dialog.assignedManagerId = managerId;
  dialog.assignedAt = dialog.assignedAt || nowIso();
  dialog.updatedAt = nowIso();
}

function queueDialog(dialog) {
  dialog.status = "queued";
  dialog.queuedAt = dialog.queuedAt || nowIso();
  dialog.updatedAt = nowIso();
}

async function notifyAssignedManager(dialog, clientText, kind) {
  if (!botToken || !dialog.assignedManagerId) return 0;

  const text = kind === "new"
    ? formatNewDialogText(dialog)
    : formatClientMessageText(dialog, clientText);
  const sent = await sendManagerMessage(dialog, dialog.assignedManagerId, text).catch((error) => {
    console.error(`Telegram send failed for ${dialog.assignedManagerId}:`, error.message);
    return null;
  });

  return sent ? 1 : 0;
}

function formatNewDialogText(dialog) {
  const clientMessages = dialog.messages
    .filter((message) => message.channel === "client")
    .slice(-5)
    .map((message) => `Клиент: ${message.text}`)
    .join("\n");

  return [
    "Новый клиент с сайта",
    "",
    `Клиент: #${dialog.number}`,
    `Тема: ${dialog.topic || "не выбрана"}`,
    dialog.page ? `Страница: ${dialog.page}` : "",
    "",
    clientMessages,
    "",
    "Отвечайте сюда обычным сообщением. Пока вы не завершите диалог, новые клиенты вам не назначаются."
  ]
    .filter(Boolean)
    .join("\n");
}

function formatClientMessageText(dialog, clientText) {
  return [
    `Клиент #${dialog.number}:`,
    clientText,
    "",
    "Ответьте обычным сообщением. Завершить диалог можно кнопкой ниже или командой /done."
  ].join("\n");
}

async function sendManagerMessage(dialog, managerId, text) {
  const result = await telegram("sendMessage", {
    chat_id: managerId,
    text,
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Завершить диалог",
            callback_data: `done:${dialog.id}`
          }
        ]
      ]
    }
  });

  if (result?.ok) {
    rememberTelegramMessage(dialog.id, managerId, result.result.message_id);
  }

  return result;
}

async function startTelegramPolling() {
  console.log("Telegram polling started. Managers can send /start to get chat_id.");

  while (true) {
    try {
      const result = await telegram("getUpdates", {
        offset: telegramOffset,
        timeout: 25,
        allowed_updates: ["message", "callback_query"]
      });

      if (result.ok) {
        for (const update of result.result) {
          telegramOffset = update.update_id + 1;
          await handleTelegramUpdate(update);
        }
      }
    } catch (error) {
      console.error("Telegram polling error:", error.message);
      await delay(3000);
    }
  }
}

async function handleTelegramUpdate(update) {
  if (update.callback_query) {
    await handleTelegramCallback(update.callback_query);
    return;
  }

  const message = update.message;
  if (!message?.chat) return;

  const chatId = String(message.chat.id);
  const text = cleanText(message.text || "");

  if (text === "/start" || text === "/whoami") {
    await handleManagerStart(message, chatId);
    return;
  }

  if (!isManager(chatId)) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: `Вы пока не добавлены как менеджер. Ваш chat_id: ${chatId}`
    });
    return;
  }

  if (text === "/done" || text === "/finish") {
    await finishActiveDialog(chatId);
    return;
  }

  if (!text) return;

  const replyDialogId = message.reply_to_message
    ? getDialogIdByTelegramMessage(chatId, message.reply_to_message.message_id)
    : "";
  const activeDialog = getActiveDialogForManager(chatId);
  const dialogId = replyDialogId || activeDialog?.id || "";

  if (!dialogId) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Сейчас нет активного диалога. Когда появится клиент, я пришлю его сюда."
    });
    return;
  }

  await addManagerMessage(dialogId, chatId, text);
}

async function handleManagerStart(message, chatId) {
  const user = message.from || {};
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Менеджер";
  const username = user.username || "";
  const alreadyManager = isManager(chatId);

  if (!alreadyManager) {
    rememberPendingManager({
      id: chatId,
      name: displayName,
      username,
      requestedAt: nowIso()
    });
  }

  const managerJson = JSON.stringify({ id: chatId, name: displayName, username }, null, 2);

  await telegram("sendMessage", {
    chat_id: chatId,
    text: [
      `Ваш Telegram chat_id: ${chatId}`,
      `Имя: ${displayName}`,
      username ? `Username: @${username}` : "Username: не указан",
      alreadyManager ? "Статус: вы уже добавлены как менеджер." : "Статус: ожидает одобрения.",
      "",
      "Готовый блок для managers.json:",
      managerJson
    ].join("\n")
  });
}

async function handleTelegramCallback(callback) {
  const chatId = String(callback.message?.chat?.id || callback.from?.id || "");
  const data = callback.data || "";

  if (!chatId || !data.startsWith("done:")) return;

  await finishDialog(data.slice("done:".length), chatId);
  await telegram("answerCallbackQuery", {
    callback_query_id: callback.id,
    text: "Диалог завершен"
  }).catch(() => {});
}

async function addManagerMessage(dialogId, managerId, text) {
  const store = readDialogStore();
  const dialog = store.leads.find((item) => item.id === dialogId);

  if (!dialog) {
    await telegram("sendMessage", { chat_id: managerId, text: "Диалог не найден." });
    return;
  }

  if (dialog.status === "closed") {
    await telegram("sendMessage", { chat_id: managerId, text: "Этот диалог уже завершен." });
    return;
  }

  if (String(dialog.assignedManagerId) !== String(managerId)) {
    await telegram("sendMessage", {
      chat_id: managerId,
      text: `Этот диалог ведет ${formatManagerName(getManagerById(dialog.assignedManagerId))}.`
    });
    return;
  }

  dialog.messages.push(createMessage("manager", text, { managerChatId: managerId }));
  dialog.status = "active";
  dialog.updatedAt = nowIso();
  writeDialogStore(store);
}

async function finishActiveDialog(managerId) {
  const dialog = getActiveDialogForManager(managerId);

  if (!dialog) {
    await telegram("sendMessage", {
      chat_id: managerId,
      text: "У вас нет активного диалога."
    });
    return;
  }

  await finishDialog(dialog.id, managerId);
}

async function finishDialog(dialogId, managerId) {
  const store = readDialogStore();
  const dialog = store.leads.find((item) => item.id === dialogId);

  if (!dialog) return;

  if (String(dialog.assignedManagerId) !== String(managerId)) {
    await telegram("sendMessage", {
      chat_id: managerId,
      text: `Этот диалог ведет ${formatManagerName(getManagerById(dialog.assignedManagerId))}.`
    });
    return;
  }

  if (dialog.status === "closed") {
    await telegram("sendMessage", {
      chat_id: managerId,
      text: `Диалог с клиентом #${dialog.number} уже завершен.`
    });
    return;
  }

  dialog.status = "closed";
  dialog.closedAt = nowIso();
  dialog.updatedAt = dialog.closedAt;
  dialog.messages.push(createMessage("system", "Диалог завершен менеджером."));
  writeDialogStore(store);

  await telegram("sendMessage", {
    chat_id: managerId,
    text: `Диалог с клиентом #${dialog.number} завершен.`
  });

  await dispatchNextQueuedDialog(managerId);
}

async function dispatchNextQueuedDialog(managerId) {
  const store = readDialogStore();
  const nextDialog = store.leads
    .filter((dialog) => dialog.status === "queued" && !dialog.assignedManagerId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];

  if (!nextDialog) {
    await telegram("sendMessage", {
      chat_id: managerId,
      text: "Очередь пуста. Нового клиента пока нет."
    });
    return;
  }

  assignDialog(nextDialog, managerId);
  writeDialogStore(store);
  await sendManagerMessage(nextDialog, managerId, formatNewDialogText(nextDialog));
}

function getFreeManager(store = readDialogStore()) {
  return getManagers().find((manager) => !isManagerBusy(manager.id, store)) || null;
}

function isManagerBusy(managerId, store = readDialogStore()) {
  return store.leads.some(
    (dialog) => String(dialog.assignedManagerId) === String(managerId) && dialog.status === "active"
  );
}

function getActiveDialogForManager(managerId) {
  const store = readDialogStore();
  return store.leads.find(
    (dialog) => String(dialog.assignedManagerId) === String(managerId) && dialog.status === "active"
  );
}

function createMessage(channel, text, extra = {}) {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    channel,
    text,
    createdAt: nowIso(),
    ...extra
  };
}

async function telegram(method, payload) {
  if (!botApi) {
    throw new Error("Telegram bot token is missing");
  }

  const response = await fetch(`${botApi}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram API error ${response.status}`);
  }

  return data;
}

function rememberTelegramMessage(dialogId, chatId, messageId) {
  const store = readDialogStore();
  const dialog = store.leads.find((item) => item.id === dialogId);
  if (!dialog) return;

  dialog.telegramMessages = dialog.telegramMessages || {};
  dialog.telegramMessages[`${chatId}:${messageId}`] = true;
  writeDialogStore(store);
}

function getDialogIdByTelegramMessage(chatId, messageId) {
  const store = readDialogStore();
  const key = `${chatId}:${messageId}`;
  const dialog = store.leads.find((item) => item.telegramMessages && item.telegramMessages[key]);
  return dialog ? dialog.id : "";
}

function getManagers() {
  const fromEnv = (process.env.TELEGRAM_MANAGER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => ({ id, name: "", username: "", enabled: true }));

  if (fromEnv.length > 0) return fromEnv;

  return (readManagersStore().managers || [])
    .map((manager) => ({
      id: String(manager.id).trim(),
      name: manager.name || "",
      username: manager.username || "",
      enabled: manager.enabled !== false
    }))
    .filter((manager) => manager.id && manager.enabled);
}

function getManagerById(id) {
  if (!id) return null;
  return getManagers().find((manager) => String(manager.id) === String(id)) || null;
}

function formatManagerName(manager) {
  if (!manager) return "другой менеджер";
  if (manager.name && manager.username) return `${manager.name} (@${manager.username})`;
  return manager.name || (manager.username ? `@${manager.username}` : `ID ${manager.id}`);
}

function isManager(chatId) {
  return getManagers().some((manager) => String(manager.id) === String(chatId));
}

function isAdminRequest(request) {
  if (!adminApproveToken) return true;

  const url = new URL(request.url, `http://${request.headers.host}`);
  return request.headers["x-admin-token"] === adminApproveToken ||
    url.searchParams.get("token") === adminApproveToken;
}

function readManagersStore() {
  try {
    return JSON.parse(fs.readFileSync(managersPath, "utf8"));
  } catch {
    return { managers: [] };
  }
}

function writeManagersStore(store) {
  fs.writeFileSync(managersPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function readPendingManagers() {
  try {
    return JSON.parse(fs.readFileSync(pendingManagersPath, "utf8"));
  } catch {
    return { pending: [] };
  }
}

function writePendingManagers(store) {
  fs.writeFileSync(pendingManagersPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function rememberPendingManager(candidate) {
  const store = readPendingManagers();
  const exists = store.pending.some((manager) => String(manager.id) === String(candidate.id));

  if (!exists) {
    store.pending.push(candidate);
    writePendingManagers(store);
  }
}

function readDialogStore() {
  try {
    const store = JSON.parse(fs.readFileSync(dialogsPath, "utf8"));
    store.counter = Number(store.counter || 1044);
    store.leads = (store.leads || []).map(normalizeDialog);
    return store;
  } catch {
    return { counter: 1044, leads: [] };
  }
}

function writeDialogStore(store) {
  fs.writeFileSync(dialogsPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function normalizeDialog(dialog) {
  return {
    id: dialog.id || `dialog_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    number: Number(dialog.number || 0),
    sessionId: dialog.sessionId || "",
    status: ["active", "queued", "closed"].includes(dialog.status) ? dialog.status : "closed",
    topic: dialog.topic || dialog.product || "Не выбрана",
    product: dialog.product || dialog.topic || "Не выбрана",
    page: dialog.page || "",
    assignedManagerId: dialog.assignedManagerId || "",
    assignedAt: dialog.assignedAt || "",
    queuedAt: dialog.queuedAt || "",
    closedAt: dialog.closedAt || "",
    createdAt: dialog.createdAt || nowIso(),
    updatedAt: dialog.updatedAt || dialog.createdAt || nowIso(),
    lastClientAt: dialog.lastClientAt || "",
    messages: dialog.messages || [],
    telegramMessages: dialog.telegramMessages || {}
  };
}

function serveStatic(urlPath, response) {
  const safePath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);

  if (!publicFiles.has(safePath)) {
    return sendText(response, 404, "Not found");
  }

  const filePath = path.normalize(path.join(root, safePath));

  if (!filePath.startsWith(root)) {
    return sendText(response, 403, "Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      return sendText(response, 404, "Not found");
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    response.end(content);
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function ensureStorage() {
  if (!fs.existsSync(storageRoot)) fs.mkdirSync(storageRoot, { recursive: true });
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  if (!fs.existsSync(dialogsPath)) writeDialogStore({ counter: 1044, leads: [] });
  if (!fs.existsSync(managersPath)) writeManagersStore({ managers: [] });
  if (!fs.existsSync(pendingManagersPath)) writePendingManagers({ pending: [] });
}

function loadDotEnv() {
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function cleanText(value) {
  return String(value).trim().slice(0, 3000);
}

function nowIso() {
  return new Date().toISOString();
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
