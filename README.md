# Malina landing and Telegram chat prototype

Прототип лендинга типографии "Малина" с чат-виджетом на сайте и Telegram-ботом для менеджеров.

## Что делает система

- Клиент пишет в чат на сайте.
- Сервер создает или продолжает открытый диалог этого клиента.
- Свободный менеджер получает диалог в Telegram.
- Пока менеджер ведет клиента, новые клиенты этому менеджеру не назначаются.
- Если все менеджеры заняты, новые клиенты попадают в очередь.
- Менеджер отвечает обычным сообщением в Telegram, ответ появляется в чате сайта.
- Менеджер завершает диалог кнопкой "Завершить диалог" или командой `/done`.
- После завершения менеджеру автоматически назначается следующий клиент из очереди.
- Клиент видит номер обращения, его состояние и позицию в очереди прямо в чат-виджете.

## Архитектура

- **Серверная часть сайта** — HTTP API, проверка запросов, модель и хранение диалогов, история сообщений, health-check и безопасный клиентский статус обращения.
- **Telegram-интеграция и диспетчеризация** — регистрация менеджеров, выбор свободного сотрудника, FIFO-очередь, ответы и завершение диалогов.

Подробная граница ответственности и контракт между модулями приведены в [ARCHITECTURE.md](ARCHITECTURE.md).

## Сущности

**Client**

- `id` - стабильный технический идентификатор клиента.
- `sessionId` - браузерная сессия, по которой продолжается открытый диалог.
- `name`, `email`, `phone` - имя и выбранный клиентом способ связи.

**Dialog**

- `id` - технический идентификатор диалога.
- `number` - удобный номер клиента для менеджера.
- `sessionId` - браузерная сессия посетителя.
- `status` - `new`, `active`, `queued`, `closed`.
- `topic` - выбранная тема: пакеты, коробки, наклейки.
- `page` - страница, с которой написал клиент.
- `assignedManagerId` - Telegram chat_id назначенного менеджера.
- `brief` - тираж, город и желаемый срок.
- `consent` - версия, дата и сессия подтверждённого согласия.
- `messages` - история сообщений клиента, менеджера и системы.

**Manager**

- `id` - Telegram chat_id.
- `name` - удобное имя.
- `username` - username в Telegram.
- `role` - `manager` или `admin`; админ также остается менеджером и может вести диалоги.
- `enabled` - можно ли назначать менеджеру диалоги.

**Message**

- `id` - технический идентификатор сообщения.
- `channel` - `client`, `manager`, `system`.
- `text` - текст сообщения.
- `createdAt` - дата создания.

## Локальный запуск

1. Создайте бота через BotFather и получите токен.
2. Скопируйте `.env.example` в `.env`.
3. Заполните `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
PORT=4174
HOST=127.0.0.1
APP_DATA_DIR=.
DATABASE_URL=postgresql://malina:malina@127.0.0.1:5432/malina
DATABASE_REQUIRED=false
DATABASE_SSL=false
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_POOL_SIZE=10
FINISH_REMINDER_MS=300000
MAX_UPLOAD_BYTES=8388608
MAX_ATTACHMENTS=3
MAX_TOTAL_UPLOAD_BYTES=12582912
MAX_REQUEST_BYTES=12582912
LEAD_RATE_LIMIT_WINDOW_MS=60000
LEAD_RATE_LIMIT_MAX=12
```

4. Установите зависимости и запустите сервер:

```powershell
npm install
node server.js
```

5. Откройте сайт:

```text
http://127.0.0.1:4174/
```

Можно также запустить через PowerShell-скрипт:

```powershell
.\start.ps1
```

На Windows, если PowerShell блокирует запуск `.ps1`, используйте обычный CMD-файл:

```cmd
run-local.cmd
```

Для фонового запуска:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-background.ps1
```

Проверить статус:

```powershell
powershell -ExecutionPolicy Bypass -File .\status-local.ps1
```

Остановить локальный сервер:

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-local.ps1
```

Запуск через Docker:

```powershell
docker compose up -d --build
```

Проверка Docker-контейнера:

```powershell
docker compose ps
Invoke-RestMethod http://127.0.0.1:4174/api/health
```

Остановка Docker-контейнера:

```powershell
docker compose down
```

Docker Compose поднимает приложение и PostgreSQL, ждет готовности базы и только затем запускает сервер. Клиенты, диалоги и сообщения хранятся в volume `malina_malina-postgres`, загруженные файлы - в `malina_malina-uploads`, а менеджеры остаются в `managers.json` и `pending-managers.json`.

При заданном `DATABASE_URL` сервер автоматически создает таблицы из `db/schema.sql`. Если база пустая, существующие диалоги из `data/leads.json` импортируются один раз. При `DATABASE_REQUIRED=true` ошибка подключения останавливает запуск; при `false` используется совместимый JSON-режим. Поле `storage` в `GET /api/health` показывает фактически выбранное хранилище.

Основные таблицы:

- `clients` - контактные данные и браузерные сессии;
- `dialogs` - состояние, очередь, назначение менеджера и временные метки;
- `messages` - история сообщений и метаданные вложений;
- `app_state` - счетчик удобных номеров диалогов.

Если проект лежит в папке с кириллицей или пробелами и Docker Compose ругается на имя проекта, в `docker-compose.yml` уже задано явное имя `malina`.
По умолчанию кнопка завершения диалога повторно отправляется менеджеру через 5 минут. Для тестов можно изменить `FINISH_REMINDER_MS` в `.env`.
Файлы из чата сохраняются в `APP_DATA_DIR/uploads` и пересылаются менеджеру в Telegram. Разрешены PDF, PNG, JPG и WebP; по умолчанию можно отправить до трёх файлов, каждый до 8 МБ и суммарно до 12 МБ.

Временная публичная ссылка через Cloudflare Tunnel:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-online-tunnel.ps1
```

Скрипт запустит Docker-контейнер и выдаст HTTPS-ссылку вида `https://...trycloudflare.com`.
Ссылка работает, пока включен ПК, Docker Desktop и процесс `cloudflared`.

Остановить публичную ссылку:

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-online-tunnel.ps1
```

## Как добавить менеджера

1. В `managers.json` должен быть хотя бы один пользователь с `"role": "admin"`.
2. Менеджер открывает Telegram-бота и отправляет `/start`.
3. Сервер сохраняет кандидата в `pending-managers.json`.
4. Админ получает в Telegram уведомление с кнопкой "Одобрить менеджера".
5. Админ может посмотреть кандидатов командой:

```
/pending
```

6. Одобрить вручную можно командой:

```
/approve 123456789
```

7. Список действующих менеджеров:

```
/managers
```

Реальный `managers.json` не коммитится в GitHub. Для примера есть `managers.example.json`.

## API

- `GET /api/health` - состояние сервера, бота, менеджеров и очереди.
- `POST /api/leads` - новое сообщение клиента или продолжение диалога.
- `GET /api/leads/:id/messages` - история сообщений для сайта.
- `GET /api/leads/:id/status` - безопасный клиентский статус, номер обращения и позиция в очереди.

## Проверка логики

Сценарий с одним менеджером:

1. Клиент 1 пишет первое сообщение.
2. Менеджер получает новый диалог в Telegram.
3. Клиент 1 пишет второе сообщение.
4. Менеджер получает продолжение этого же диалога, а не новую заявку.
5. Клиент 2 пишет сообщение.
6. Клиент 2 попадает в очередь, потому что менеджер занят.
7. Менеджер завершает диалог с клиентом 1.
8. Сервер сразу назначает менеджеру клиента 2.

## Структура проекта

- `index.html` - лендинг и разметка чат-виджета.
- `styles.css` - стили лендинга и виджета.
- `script.js` - логика виджета на сайте.
- `server.js` - HTTP API, хранение диалогов и Telegram polling.
- `src/client-dialog-status.js` - клиентское представление состояния диалога без внутренних данных менеджера.
- `test/client-dialog-status.test.js` - проверки клиентского статуса и позиции FIFO.
- `ARCHITECTURE.md` - описание модулей и границы ответственности.
- `.env.example` - пример переменных окружения.
- `render.yaml` - конфигурация для деплоя на Render.
- `Dockerfile`, `docker-compose.yml` - универсальная сборка для VPS, Docker-хостингов и локального Docker Desktop.
- `managers.example.json` - пример списка менеджеров.
- `start.ps1`, `run-local.cmd`, `start-background.ps1`, `status-local.ps1`, `stop-local.ps1` - локальный запуск на Windows.
- `start-online-tunnel.ps1`, `stop-online-tunnel.ps1` - временный онлайн-доступ через Cloudflare Tunnel.
- `data/leads.json` - локальное хранилище диалогов, не коммитится.
- `managers.json` - реальные менеджеры, не коммитятся.
- `pending-managers.json` - ожидающие менеджеры, не коммитятся.

## Деплой на сервер

### Вариант 1: Render

Render подходит для быстрого запуска Node.js-сервиса с публичной HTTPS-ссылкой.

1. Откройте Render Dashboard.
2. Выберите **New +** -> **Blueprint**.
3. Подключите GitHub-репозиторий `ignorov3-maker/malina_tg_bot`.
4. Render прочитает `render.yaml`.
5. Укажите секретные переменные:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

6. Дождитесь сборки и запуска.
7. Откройте выданный Render URL.
8. Проверьте `/api/health`.

В `render.yaml` уже указаны:

- `HOST=0.0.0.0` - чтобы сайт был доступен извне;
- `APP_DATA_DIR=/var/data` - чтобы менеджеры и диалоги хранились на постоянном диске;
- persistent disk `malina-data` на 1 GB;
- секреты через `sync: false`, чтобы они не попадали в GitHub.

### Вариант 2: VPS + Docker

Минимальные требования:

- VPS на Ubuntu 22.04/24.04.
- Node.js 20+.
- Домен и HTTPS через Nginx + Let's Encrypt.
- Один постоянно запущенный процесс Node.js через `pm2` или systemd.
- Переменные окружения: `TELEGRAM_BOT_TOKEN`, `PORT`, `FINISH_REMINDER_MS`.
- Папка `data/` должна сохраняться между перезапусками и деплоями.

Пример запуска через Docker:

```bash
docker build -t malina-tg-bot .
docker run -d \
  --name malina-tg-bot \
  --restart unless-stopped \
  -p 4174:4174 \
  -e TELEGRAM_BOT_TOKEN="your_bot_token_here" \
  -e HOST="0.0.0.0" \
  -e PORT="4174" \
  -e APP_DATA_DIR="/var/lib/malina" \
  -v malina-data:/var/lib/malina \
  malina-tg-bot
```

После этого Nginx должен проксировать домен на `http://127.0.0.1:4174`.

Перед продакшеном нужно добавить:

- Отдельную панель мониторинга для истории диалогов, если понадобится.
- Webhook Telegram вместо long polling.
- Логи ошибок и резервные копии данных.
- Политику обработки персональных данных.
- Ограничение частоты запросов и безопасную проверку загружаемых файлов.

Полный аудит текущих возможностей и приоритеты развития приведены в `DEVELOPMENT_ROADMAP.md`.
