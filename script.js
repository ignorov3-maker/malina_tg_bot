const widget = document.querySelector("[data-chat-widget]");
const body = document.querySelector("[data-chat-body]");
const form = document.querySelector("[data-chat-form]");
const input = form.querySelector("[data-chat-message]");
const fileInput = form.querySelector("[data-chat-file]");
const attachButton = form.querySelector("[data-attach-file]");
const filePreview = form.querySelector("[data-file-preview]");
const submitButton = form.querySelector("[data-send-message]");
const consentInput = form.querySelector("[data-chat-consent]");
const contactFields = document.querySelector("[data-contact-fields]");
const nameInput = document.querySelector("[data-client-name]");
const emailInput = document.querySelector("[data-client-email]");
const topicInput = document.querySelector("[data-client-topic]");

const sessionKey = "malina-chat-session";
const dialogKey = "malina-chat-dialog";
const contactKey = "malina-chat-contact";
const maxAttachmentBytes = 8 * 1024 * 1024;
const sessionId =
  localStorage.getItem(sessionKey) ||
  (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

localStorage.setItem(sessionKey, sessionId);

let activeDialogId = localStorage.getItem(dialogKey) || "";
let renderedMessageIds = new Set();
let pollTimer = null;
let dialogClosed = false;

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

const clearSavedDialog = () => {
  activeDialogId = "";
  localStorage.removeItem(dialogKey);
  localStorage.removeItem(contactKey);
};

const openChat = () => {
  widget.classList.add("is-open");
  input.focus();
  startPolling();
};

const closeChat = () => {
  widget.classList.remove("is-open");
};

const setFormDisabled = (disabled) => {
  input.disabled = disabled;
  fileInput.disabled = disabled;
  attachButton.disabled = disabled;
  submitButton.disabled = disabled;
  consentInput.disabled = disabled;
};

const setContactDisabled = (disabled) => {
  nameInput.disabled = disabled;
  emailInput.disabled = disabled;
  topicInput.disabled = disabled;
  contactFields.classList.toggle("is-locked", disabled);
};

const getContact = () => ({
  name: nameInput.value.trim(),
  email: emailInput.value.trim(),
  topic: topicInput.value.trim()
});

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const validateStartFields = () => {
  if (activeDialogId) return true;

  const contact = getContact();

  if (!contact.name) {
    botReply("Укажите имя, чтобы менеджер понимал, к кому обращаться.");
    nameInput.focus();
    return false;
  }

  if (!isEmail(contact.email)) {
    botReply("Укажите корректный email для связи и расчета.");
    emailInput.focus();
    return false;
  }

  if (!contact.topic) {
    botReply("Выберите тему обращения.");
    topicInput.focus();
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

const buildAttachment = async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return null;

  if (file.size > maxAttachmentBytes) {
    throw new Error(`Файл слишком большой. Максимум ${formatBytes(maxAttachmentBytes)}.`);
  }

  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    data: await readFileAsBase64(file)
  };
};

const clearAttachment = () => {
  fileInput.value = "";
  filePreview.hidden = true;
  filePreview.textContent = "";
};

const updateFilePreview = () => {
  const file = fileInput.files && fileInput.files[0];

  if (!file) {
    clearAttachment();
    return;
  }

  filePreview.hidden = false;
  filePreview.textContent = `${file.name} · ${formatBytes(file.size)}`;
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
  emailInput.value = "";
  topicInput.value = "";
  consentInput.checked = false;
  addBubble("Новый диалог начат. Заполните контакты и напишите сообщение.");
  nameInput.focus();
};

const showDialogClosed = (data) => {
  if (dialogClosed) return;

  dialogClosed = true;
  clearSavedDialog();
  setFormDisabled(true);
  setContactDisabled(false);

  addBubble("Диалог завершен менеджером. Если нужен новый расчет, начните новый диалог.", "bot", `closed-${data.leadId}`);
  addActionButton("Начать новый диалог", resetForNewDialog, `restart-${data.leadId}`);

  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
};

const sendClientMessage = async (message, attachment = null) => {
  const contact = getContact();
  const response = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      leadId: activeDialogId,
      clientName: contact.name,
      clientEmail: contact.email,
      topic: contact.topic,
      product: contact.topic,
      message,
      attachments: attachment ? [attachment] : [],
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

  const response = await fetch(`/api/leads/${encodeURIComponent(activeDialogId)}/messages`);
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

  syncMessages();
  pollTimer = window.setInterval(syncMessages, 3000);
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

document.querySelectorAll("[data-open-chat]").forEach((button) => {
  button.addEventListener("click", openChat);
});

document.querySelector("[data-close-chat]").addEventListener("click", closeChat);

document.querySelectorAll("[data-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    topicInput.value = button.dataset.choice;
    addBubble(button.dataset.choice, "user");
    botReply("Отлично. Теперь укажите имя, email и напишите тираж, город или вопрос.");
  });
});

attachButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", updateFilePreview);

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

  let attachment = null;

  try {
    attachment = await buildAttachment();
    addBubble(value || "Отправлен файл", "user", "", attachment ? [attachment] : []);
    input.value = "";
    setFormDisabled(true);

    const result = await sendClientMessage(value, attachment);
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

if (activeDialogId && savedContact.name && savedContact.email && savedContact.topic) {
  nameInput.value = savedContact.name;
  emailInput.value = savedContact.email;
  topicInput.value = savedContact.topic;
  setContactDisabled(true);
} else if (activeDialogId) {
  clearSavedDialog();
  setContactDisabled(false);
}
