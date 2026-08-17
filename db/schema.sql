CREATE TABLE IF NOT EXISTS app_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id text PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dialogs (
  id text PRIMARY KEY,
  number integer NOT NULL UNIQUE,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  session_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('new', 'active', 'queued', 'closed')),
  topic text NOT NULL DEFAULT 'Не выбрана',
  product text NOT NULL DEFAULT 'Не выбрана',
  page text NOT NULL DEFAULT '',
  assigned_manager_id text NOT NULL DEFAULT '',
  assigned_at timestamptz,
  queued_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  last_client_at timestamptz,
  last_finish_reminder_at timestamptz,
  consent jsonb NOT NULL DEFAULT '{}'::jsonb,
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  telegram_messages jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';

ALTER TABLE dialogs
  ADD COLUMN IF NOT EXISTS consent jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE dialogs
  ADD COLUMN IF NOT EXISTS brief jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS dialogs_session_open_idx
  ON dialogs (session_id, status);

CREATE INDEX IF NOT EXISTS dialogs_queue_idx
  ON dialogs (queued_at, number)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS dialogs_manager_active_idx
  ON dialogs (assigned_manager_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  dialog_id text NOT NULL REFERENCES dialogs(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('client', 'manager', 'system')),
  text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL,
  manager_chat_id text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS messages_dialog_created_idx
  ON messages (dialog_id, created_at, id);
