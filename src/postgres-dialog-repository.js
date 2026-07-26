"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const schemaPath = path.join(__dirname, "..", "db", "schema.sql");

function asIso(value) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asNullableDate(value) {
  return value ? new Date(value) : null;
}

function clientIdForSession(sessionId) {
  return `client_${crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 32)}`;
}

function createPostgresDialogRepository(options) {
  const PoolClass = options.PoolClass || require("pg").Pool;
  const pool = new PoolClass({
    connectionString: options.connectionString,
    max: Number(options.poolSize || 10),
    ssl: options.ssl ? { rejectUnauthorized: options.rejectUnauthorized !== false } : false
  });

  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error.message);
  });

  async function initialize() {
    await pool.query(fs.readFileSync(schemaPath, "utf8"));
  }

  async function loadStore() {
    const [stateResult, dialogResult, messageResult] = await Promise.all([
      pool.query("SELECT value FROM app_state WHERE key = 'dialog_counter'"),
      pool.query(`
        SELECT d.*, c.name AS client_name, c.email AS client_email
        FROM dialogs d
        JOIN clients c ON c.id = d.client_id
        ORDER BY d.number
      `),
      pool.query(`
        SELECT *
        FROM messages
        ORDER BY dialog_id, created_at, id
      `)
    ]);
    const messagesByDialog = new Map();

    for (const row of messageResult.rows) {
      const items = messagesByDialog.get(row.dialog_id) || [];
      items.push({
        id: row.id,
        channel: row.channel,
        text: row.text,
        createdAt: asIso(row.created_at),
        ...(row.manager_chat_id ? { managerChatId: row.manager_chat_id } : {}),
        ...(Array.isArray(row.attachments) && row.attachments.length
          ? { attachments: row.attachments }
          : {})
      });
      messagesByDialog.set(row.dialog_id, items);
    }

    const leads = dialogResult.rows.map((row) => ({
      id: row.id,
      number: Number(row.number),
      sessionId: row.session_id,
      status: row.status,
      topic: row.topic,
      product: row.product,
      clientName: row.client_name,
      clientEmail: row.client_email,
      page: row.page,
      assignedManagerId: row.assigned_manager_id,
      assignedAt: asIso(row.assigned_at),
      queuedAt: asIso(row.queued_at),
      closedAt: asIso(row.closed_at),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      lastClientAt: asIso(row.last_client_at),
      lastFinishReminderAt: asIso(row.last_finish_reminder_at),
      messages: messagesByDialog.get(row.id) || [],
      telegramMessages: row.telegram_messages || {}
    }));
    const storedCounter = Number(stateResult.rows[0]?.value || 0);
    const maxNumber = leads.reduce((maximum, dialog) => Math.max(maximum, dialog.number), 1044);

    return {
      counter: Math.max(storedCounter, maxNumber),
      leads
    };
  }

  async function saveStore(store) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO app_state (key, value, updated_at)
          VALUES ('dialog_counter', $1::jsonb, now())
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        `,
        [JSON.stringify(Number(store.counter || 1044))]
      );

      for (const dialog of store.leads || []) {
        const clientId = clientIdForSession(dialog.sessionId);
        await client.query(
          `
            INSERT INTO clients (id, session_id, name, email, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (session_id)
            DO UPDATE SET
              name = EXCLUDED.name,
              email = EXCLUDED.email,
              updated_at = EXCLUDED.updated_at
          `,
          [
            clientId,
            dialog.sessionId,
            dialog.clientName || "",
            dialog.clientEmail || "",
            asNullableDate(dialog.createdAt) || new Date(),
            asNullableDate(dialog.updatedAt) || new Date()
          ]
        );
        await client.query(
          `
            INSERT INTO dialogs (
              id, number, client_id, session_id, status, topic, product, page,
              assigned_manager_id, assigned_at, queued_at, closed_at, created_at,
              updated_at, last_client_at, last_finish_reminder_at, telegram_messages
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb
            )
            ON CONFLICT (id)
            DO UPDATE SET
              number = EXCLUDED.number,
              client_id = EXCLUDED.client_id,
              session_id = EXCLUDED.session_id,
              status = EXCLUDED.status,
              topic = EXCLUDED.topic,
              product = EXCLUDED.product,
              page = EXCLUDED.page,
              assigned_manager_id = EXCLUDED.assigned_manager_id,
              assigned_at = EXCLUDED.assigned_at,
              queued_at = EXCLUDED.queued_at,
              closed_at = EXCLUDED.closed_at,
              updated_at = EXCLUDED.updated_at,
              last_client_at = EXCLUDED.last_client_at,
              last_finish_reminder_at = EXCLUDED.last_finish_reminder_at,
              telegram_messages = EXCLUDED.telegram_messages
          `,
          [
            dialog.id,
            Number(dialog.number),
            clientId,
            dialog.sessionId,
            dialog.status,
            dialog.topic || "Не выбрана",
            dialog.product || dialog.topic || "Не выбрана",
            dialog.page || "",
            String(dialog.assignedManagerId || ""),
            asNullableDate(dialog.assignedAt),
            asNullableDate(dialog.queuedAt),
            asNullableDate(dialog.closedAt),
            asNullableDate(dialog.createdAt) || new Date(),
            asNullableDate(dialog.updatedAt) || new Date(),
            asNullableDate(dialog.lastClientAt),
            asNullableDate(dialog.lastFinishReminderAt),
            JSON.stringify(dialog.telegramMessages || {})
          ]
        );
        await client.query("DELETE FROM messages WHERE dialog_id = $1", [dialog.id]);

        for (const message of dialog.messages || []) {
          await client.query(
            `
              INSERT INTO messages (
                id, dialog_id, channel, text, created_at, manager_chat_id, attachments
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            `,
            [
              message.id,
              dialog.id,
              message.channel,
              message.text || "",
              asNullableDate(message.createdAt) || new Date(),
              String(message.managerChatId || ""),
              JSON.stringify(message.attachments || [])
            ]
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function ping() {
    await pool.query("SELECT 1");
  }

  async function close() {
    await pool.end();
  }

  return {
    initialize,
    loadStore,
    saveStore,
    ping,
    close
  };
}

module.exports = {
  clientIdForSession,
  createPostgresDialogRepository
};
