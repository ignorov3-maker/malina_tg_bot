const tokenInput = document.querySelector("[data-admin-token]");
const saveTokenButton = document.querySelector("[data-save-token]");
const clearTokenButton = document.querySelector("[data-clear-token]");
const refreshButton = document.querySelector("[data-refresh]");
const pendingList = document.querySelector("[data-pending-list]");
const managerList = document.querySelector("[data-manager-list]");
const statusText = document.querySelector("[data-status]");

const tokenKey = "malina-admin-token";

const setStatus = (message, type = "") => {
  statusText.textContent = message;
  statusText.className = `status ${type}`.trim();
};

const getToken = () => tokenInput.value.trim();

const api = async (url, options = {}) => {
  const headers = {
    ...(options.headers || {}),
    "X-Admin-Token": getToken()
  };

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Ошибка ${response.status}`);
  }

  return data;
};

const renderEmpty = (root, text) => {
  root.innerHTML = "";
  const item = document.createElement("div");
  item.className = "empty";
  item.textContent = text;
  root.appendChild(item);
};

const managerTitle = (manager) => {
  if (manager.name && manager.username) return `${manager.name} (@${manager.username})`;
  return manager.name || (manager.username ? `@${manager.username}` : "Менеджер");
};

const renderManagers = (managers = []) => {
  managerList.innerHTML = "";

  if (!managers.length) {
    renderEmpty(managerList, "Пока нет одобренных менеджеров.");
    return;
  }

  managers.forEach((manager) => {
    const card = document.createElement("article");
    card.className = "manager-card";

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = managerTitle(manager);

    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = manager.enabled === false ? "Отключен" : "Активен";

    const id = document.createElement("code");
    id.textContent = `chat_id: ${manager.id}`;

    info.append(title, meta, id);
    card.appendChild(info);
    managerList.appendChild(card);
  });
};

const renderPending = (pending = []) => {
  pendingList.innerHTML = "";

  if (!pending.length) {
    renderEmpty(pendingList, "Очередь пустая. Пусть новый менеджер напишет боту /start.");
    return;
  }

  pending.forEach((manager) => {
    const card = document.createElement("article");
    card.className = "manager-card";

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = managerTitle(manager);

    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = manager.username ? `Username: @${manager.username}` : "Username не указан";

    const id = document.createElement("code");
    id.textContent = `chat_id: ${manager.id}`;

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Имя в списке менеджеров";

    const nameInput = document.createElement("input");
    nameInput.value = manager.name || manager.username || "Менеджер";

    info.append(title, meta, id, nameLabel, nameInput);

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const approveButton = document.createElement("button");
    approveButton.type = "button";
    approveButton.textContent = "Одобрить";
    approveButton.addEventListener("click", async () => {
      approveButton.disabled = true;

      try {
        await api("/api/managers/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: String(manager.id),
            name: nameInput.value.trim(),
            username: manager.username || ""
          })
        });
        setStatus(`${managerTitle(manager)} добавлен как менеджер.`, "ok");
        await loadManagers();
      } catch (error) {
        approveButton.disabled = false;
        setStatus(error.message, "error");
      }
    });

    actions.appendChild(approveButton);
    card.append(info, actions);
    pendingList.appendChild(card);
  });
};

const loadManagers = async () => {
  setStatus("Загружаю менеджеров...");

  try {
    const data = await api("/api/managers");
    renderPending(data.pending || []);
    renderManagers(data.managers || []);
    setStatus("Данные обновлены.", "ok");
  } catch (error) {
    renderEmpty(pendingList, "Не удалось загрузить ожидающих менеджеров.");
    renderEmpty(managerList, "Не удалось загрузить активных менеджеров.");
    setStatus(error.message, "error");
  }
};

saveTokenButton.addEventListener("click", async () => {
  localStorage.setItem(tokenKey, getToken());
  await loadManagers();
});

clearTokenButton.addEventListener("click", () => {
  tokenInput.value = "";
  localStorage.removeItem(tokenKey);
  renderEmpty(pendingList, "Введите админ-токен и обновите список.");
  renderEmpty(managerList, "Введите админ-токен и обновите список.");
  setStatus("Токен сброшен.");
});

refreshButton.addEventListener("click", loadManagers);

tokenInput.value = localStorage.getItem(tokenKey) || "";

if (tokenInput.value) {
  loadManagers();
} else {
  renderEmpty(pendingList, "Введите админ-токен и обновите список.");
  renderEmpty(managerList, "Введите админ-токен и обновите список.");
}
