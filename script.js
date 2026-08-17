const widget = document.querySelector("[data-chat-widget]");
const body = document.querySelector("[data-chat-body]");
const form = document.querySelector("[data-chat-form]");
const input = form.querySelector("[data-chat-message]");
const fileInput = form.querySelector("[data-chat-file]");
const attachButton = form.querySelector("[data-attach-file]");
const filePreview = form.querySelector("[data-file-preview]");
const clearFileButton = form.querySelector("[data-clear-file]");
const submitButton = form.querySelector("[data-send-message]");
const statusElement = document.querySelector("[data-chat-status]");
const chatWindow = document.querySelector(".chat-window");
const openChatButtons = [...document.querySelectorAll("[data-open-chat]")];
const contactFields = document.querySelector("[data-contact-fields]");
const nameInput = document.querySelector("[data-client-name]");
const contactInput = document.querySelector("[data-client-contact]");

const sessionKey = "malina-chat-session";
const dialogKey = "malina-chat-dialog";
const contactKey = "malina-chat-contact";
const maxAttachmentBytes = 8 * 1024 * 1024;
const maxAttachments = 3;
const maxTotalAttachmentBytes = 12 * 1024 * 1024;
const allowedAttachmentPattern = /\.(pdf|png|jpe?g|webp)$/i;
const consentVersion = "2026-08-17";
const sessionId =
  localStorage.getItem(sessionKey) ||
  (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

localStorage.setItem(sessionKey, sessionId);

let activeDialogId = localStorage.getItem(dialogKey) || "";
let renderedMessageIds = new Set();
let pollTimer = null;
let dialogClosed = false;
let lastChatTrigger = null;

const updateVisualViewport = () => {
  const viewport = window.visualViewport;
  const viewportHeight = viewport?.height || window.innerHeight;
  const viewportOffset = viewport?.offsetTop || 0;
  const keyboardInset = Math.max(0, window.innerHeight - viewportHeight - viewportOffset);

  document.documentElement.style.setProperty("--visual-viewport-height", `${viewportHeight}px`);
  document.documentElement.style.setProperty("--visual-viewport-bottom", `${keyboardInset}px`);
};

updateVisualViewport();
window.visualViewport?.addEventListener("resize", updateVisualViewport);
window.visualViewport?.addEventListener("scroll", updateVisualViewport);
window.addEventListener("orientationchange", updateVisualViewport);

const getSavedContact = () => {
  try {
    return JSON.parse(localStorage.getItem(contactKey) || "{}");
  } catch {
    return {};
  }
};

const saveContact = (contact) => {
  localStorage.setItem(contactKey, JSON.stringify(contact));
};

const renderDialogStatus = (data) => {
  if (!data || !data.leadNumber) {
    statusElement.hidden = true;
    return;
  }

  const queue = data.queuePosition ? ` · место в очереди: ${data.queuePosition}` : "";
  statusElement.textContent = `Обращение №${data.leadNumber} · ${data.statusLabel || "статус уточняется"}${queue}`;
  statusElement.dataset.state = data.status || "new";
  statusElement.hidden = false;
};

const clearSavedDialog = () => {
  activeDialogId = "";
  localStorage.removeItem(dialogKey);
  localStorage.removeItem(contactKey);
  renderDialogStatus(null);
};

const openChat = (event) => {
  updateVisualViewport();
  lastChatTrigger = event?.currentTarget || document.activeElement;
  widget.classList.add("is-open");
  chatWindow.setAttribute("aria-hidden", "false");
  openChatButtons.forEach((button) => button.setAttribute("aria-expanded", "true"));
  const canUseAutoFocus = window.matchMedia("(min-width: 651px) and (pointer: fine)").matches;
  if (canUseAutoFocus) {
    (activeDialogId ? input : nameInput).focus({ preventScroll: true });
  }
  startPolling();
};

const closeChat = () => {
  widget.classList.remove("is-open");
  chatWindow.setAttribute("aria-hidden", "true");
  openChatButtons.forEach((button) => button.setAttribute("aria-expanded", "false"));
  if (lastChatTrigger && typeof lastChatTrigger.focus === "function") lastChatTrigger.focus();
};

const setFormDisabled = (disabled) => {
  input.disabled = disabled;
  fileInput.disabled = disabled;
  attachButton.disabled = disabled;
  clearFileButton.disabled = disabled;
  submitButton.disabled = disabled;
};

const setContactDisabled = (disabled) => {
  nameInput.disabled = disabled;
  contactInput.disabled = disabled;
  contactFields.classList.toggle("is-locked", disabled);
};

const getContact = () => {
  const replyTo = contactInput.value.trim();
  return {
    name: nameInput.value.trim(),
    email: replyTo.includes("@") ? replyTo : "",
    phone: replyTo && !replyTo.includes("@") ? replyTo : "",
    topic: document.querySelector("[data-choice].is-selected")?.dataset.choice || "Другое",
    quantity: "",
    city: "",
    deadline: ""
  };
};

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isPhone = (value) => value.replace(/\D/g, "").length >= 10;

const clearFieldError = (field) => {
  field.removeAttribute("aria-invalid");
  field.closest("label")?.querySelector(".contact-field-error")?.remove();
};

const showFieldError = (field, message) => {
  clearFieldError(field);
  field.setAttribute("aria-invalid", "true");

  const error = document.createElement("small");
  error.className = "contact-field-error";
  error.textContent = message;
  field.closest("label")?.appendChild(error);
  field.focus();
  field.scrollIntoView({ block: "nearest" });
};

[nameInput, contactInput].forEach((field) => {
  field.addEventListener("input", () => clearFieldError(field));
  field.addEventListener("change", () => clearFieldError(field));
});

const validateStartFields = () => {
  if (activeDialogId) return true;

  const contact = getContact();

  [nameInput, contactInput].forEach(clearFieldError);

  if (contactInput.value.trim() && !isEmail(contact.email) && !isPhone(contact.phone)) {
    showFieldError(contactInput, "Проверьте телефон или e-mail либо оставьте поле пустым.");
    return false;
  }

  return true;
};

const formatBytes = (bytes) => {
  if (!bytes) return "0 Б";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
};

const describeAttachments = (attachments = []) =>
  attachments
    .map((attachment) => `Файл: ${attachment.name || "без имени"} (${formatBytes(attachment.size || 0)})`)
    .join("\n");

const addBubble = (text, type = "bot", messageId = "", attachments = []) => {
  if (messageId && renderedMessageIds.has(messageId)) return;

  const bubble = document.createElement("div");
  bubble.className = type === "user" ? "user-bubble" : "bot-bubble";
  const attachmentText = describeAttachments(attachments);
  bubble.textContent = [text, attachmentText].filter(Boolean).join("\n");
  body.appendChild(bubble);
  body.scrollTop = body.scrollHeight;

  if (messageId) renderedMessageIds.add(messageId);
};

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    });
    reader.addEventListener("error", () => reject(new Error("Не удалось прочитать файл")));
    reader.readAsDataURL(file);
  });

const buildAttachments = async () => {
  const files = [...(fileInput.files || [])];
  if (!files.length) return [];
  if (files.length > maxAttachments) throw new Error(`Можно прикрепить не более ${maxAttachments} файлов.`);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > maxTotalAttachmentBytes) {
    throw new Error(`Общий размер файлов не должен превышать ${formatBytes(maxTotalAttachmentBytes)}.`);
  }

  return Promise.all(files.map(async (file) => {
    if (!allowedAttachmentPattern.test(file.name)) {
      throw new Error("Разрешены только PDF, PNG, JPG и WebP.");
    }
    if (file.size > maxAttachmentBytes) {
      throw new Error(`Файл ${file.name} слишком большой. Максимум ${formatBytes(maxAttachmentBytes)}.`);
    }
    return {
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      data: await readFileAsBase64(file)
    };
  }));
};

const clearAttachment = () => {
  fileInput.value = "";
  filePreview.hidden = true;
  filePreview.textContent = "";
  clearFileButton.hidden = true;
};

const updateFilePreview = () => {
  const files = [...(fileInput.files || [])];

  if (!files.length) {
    clearAttachment();
    return;
  }

  filePreview.hidden = false;
  clearFileButton.hidden = false;
  filePreview.textContent = files
    .slice(0, maxAttachments)
    .map((file) => `${file.name} · ${formatBytes(file.size)}`)
    .join("; ");
};

const addActionButton = (text, onClick, messageId = "") => {
  if (messageId && renderedMessageIds.has(messageId)) return;

  const row = document.createElement("div");
  row.className = "chat-action";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.addEventListener("click", () => {
    button.disabled = true;
    row.remove();
    onClick();
  });

  row.appendChild(button);
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;

  if (messageId) renderedMessageIds.add(messageId);
};

const botReply = (text) => {
  window.setTimeout(() => addBubble(text), 250);
};

const resetForNewDialog = () => {
  dialogClosed = false;
  renderedMessageIds = new Set();
  clearSavedDialog();
  setFormDisabled(false);
  setContactDisabled(false);
  nameInput.value = "";
  contactInput.value = "";
  document.querySelectorAll("[data-choice]").forEach((button) => button.classList.remove("is-selected"));
  addBubble("Новый диалог начат. Напишите сообщение — контакты можно не указывать.");
  input.focus();
};

const showDialogClosed = (data) => {
  if (dialogClosed) return;

  dialogClosed = true;
  clearSavedDialog();
  renderDialogStatus({ ...data, statusLabel: "диалог завершён" });
  setFormDisabled(true);
  setContactDisabled(false);

  addBubble("Диалог завершен менеджером. Если нужен новый расчет, начните новый диалог.", "bot", `closed-${data.leadId}`);
  addActionButton("Начать новый диалог", resetForNewDialog, `restart-${data.leadId}`);

  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
};

const sendClientMessage = async (message, attachments = []) => {
  const contact = getContact();
  const response = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      leadId: activeDialogId,
      clientName: contact.name,
      clientEmail: contact.email,
      clientPhone: contact.phone,
      topic: contact.topic,
      product: contact.topic,
      brief: {
        quantity: contact.quantity,
        city: contact.city,
        deadline: contact.deadline
      },
      message,
      attachments,
      consent: {
        accepted: true,
        version: consentVersion,
        acceptedAt: new Date().toISOString()
      },
      page: location.href
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Не удалось отправить сообщение");
  }

  return response.json();
};

const syncMessages = async () => {
  if (!activeDialogId) return;

  const encodedDialogId = encodeURIComponent(activeDialogId);
  const [response, statusResponse] = await Promise.all([
    fetch(`/api/leads/${encodedDialogId}/messages`),
    fetch(`/api/leads/${encodedDialogId}/status`)
  ]);

  if (statusResponse.ok) renderDialogStatus(await statusResponse.json());

  if (response.status === 404) {
    clearSavedDialog();
    setContactDisabled(false);
    addBubble("Предыдущий диалог больше недоступен. Заполните контакты, чтобы начать новый.");
    nameInput.focus();
    return;
  }

  if (!response.ok) return;

  const data = await response.json();

  data.messages.forEach((message) => {
    if (message.channel === "manager") {
      addBubble(message.text, "bot", message.id, message.attachments || []);
    }
  });

  if (data.status === "closed") {
    showDialogClosed(data);
  }
};

const startPolling = () => {
  if (pollTimer || !activeDialogId) return;

  const poll = () => syncMessages().catch(() => {});
  poll();
  pollTimer = window.setInterval(poll, 3000);
};

const showDeliveryNotice = (result) => {
  if (result.event === "dialog_started") {
    botReply("Менеджер подключился к диалогу. Ответ появится прямо здесь.");
    return;
  }

  if (result.event === "queued") {
    botReply("Все менеджеры сейчас заняты. Я поставила диалог в очередь, первый свободный менеджер подключится сюда.");
    return;
  }

  if (result.event === "no_managers") {
    botReply("Сообщение сохранено, но менеджер еще не подключен к боту.");
  }
};

openChatButtons.forEach((button) => {
  button.addEventListener("click", openChat);
});

document.querySelector("[data-close-chat]").addEventListener("click", closeChat);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && widget.classList.contains("is-open")) closeChat();
});

document.querySelectorAll("[data-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-choice]").forEach((choice) => choice.classList.remove("is-selected"));
    button.classList.add("is-selected");
    addBubble(button.dataset.choice, "user");
    botReply("Выбрано. Теперь напишите детали заказа.");
  });
});

attachButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", updateFilePreview);
clearFileButton.addEventListener("click", clearAttachment);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = input.value.trim();
  const hasFile = Boolean(fileInput.files && fileInput.files[0]);

  if (!value && !hasFile) return;

  if (dialogClosed) {
    resetForNewDialog();
    return;
  }

  if (!validateStartFields()) return;

  let attachments = [];

  try {
    attachments = await buildAttachments();
    addBubble(value || "Отправлены файлы", "user", "", attachments);
    input.value = "";
    setFormDisabled(true);

    const result = await sendClientMessage(value, attachments);
    const previousDialogId = activeDialogId;
    activeDialogId = result.leadId;
    dialogClosed = false;
    setFormDisabled(false);
    setContactDisabled(true);
    localStorage.setItem(dialogKey, activeDialogId);
    saveContact(getContact());
    clearAttachment();

    if (previousDialogId !== activeDialogId) {
      renderedMessageIds = new Set();
    }

    showDeliveryNotice(result);
    startPolling();
  } catch (error) {
    setFormDisabled(false);
    setContactDisabled(false);
    botReply(`Не получилось отправить сообщение: ${error.message}`);
  }
});

const savedContact = getSavedContact();

if (activeDialogId) {
  nameInput.value = savedContact.name || "";
  contactInput.value = savedContact.email || savedContact.phone || "";
  const savedChoice = [...document.querySelectorAll("[data-choice]")].find((button) => button.dataset.choice === savedContact.topic);
  savedChoice?.classList.add("is-selected");
  setContactDisabled(true);
}
