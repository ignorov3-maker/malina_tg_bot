const widget = document.querySelector("[data-chat-widget]");
const body = document.querySelector("[data-chat-body]");
const form = document.querySelector("[data-chat-form]");
const input = form.querySelector("input");

const sessionKey = "malina-chat-session";
const dialogKey = "malina-chat-dialog";
const sessionId =
  localStorage.getItem(sessionKey) ||
  (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

localStorage.setItem(sessionKey, sessionId);

let selectedProduct = "";
let activeDialogId = localStorage.getItem(dialogKey) || "";
let renderedMessageIds = new Set();
let pollTimer = null;

const openChat = () => {
  widget.classList.add("is-open");
  input.focus();
  startPolling();
};

const closeChat = () => {
  widget.classList.remove("is-open");
};

const addBubble = (text, type = "bot", messageId = "") => {
  if (messageId && renderedMessageIds.has(messageId)) return;

  const bubble = document.createElement("div");
  bubble.className = type === "user" ? "user-bubble" : "bot-bubble";
  bubble.textContent = text;
  body.appendChild(bubble);
  body.scrollTop = body.scrollHeight;

  if (messageId) renderedMessageIds.add(messageId);
};

const botReply = (text) => {
  window.setTimeout(() => addBubble(text), 250);
};

const sendClientMessage = async (message) => {
  const response = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      leadId: activeDialogId,
      product: selectedProduct,
      message,
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
      addBubble(message.text, "bot", message.id);
    }
  });
};

const startPolling = () => {
  if (pollTimer) return;

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
    selectedProduct = button.dataset.choice;
    addBubble(selectedProduct, "user");
    botReply("Отлично. Напишите тираж, город и есть ли готовый макет.");
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = input.value.trim();

  if (!value) return;

  addBubble(value, "user");
  input.value = "";

  try {
    const result = await sendClientMessage(value);
    const previousDialogId = activeDialogId;
    activeDialogId = result.leadId;
    localStorage.setItem(dialogKey, activeDialogId);

    if (previousDialogId !== activeDialogId) {
      renderedMessageIds = new Set();
    }

    showDeliveryNotice(result);
    startPolling();
  } catch (error) {
    botReply(`Не получилось отправить сообщение: ${error.message}`);
  }
});
