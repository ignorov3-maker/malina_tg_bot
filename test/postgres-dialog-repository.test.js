"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  clientIdForSession,
  createPostgresDialogRepository
} = require("../src/postgres-dialog-repository");

test("clientIdForSession is stable and does not expose the browser session", () => {
  const sessionId = "browser-session-with-private-value";
  const first = clientIdForSession(sessionId);
  const second = clientIdForSession(sessionId);

  assert.equal(first, second);
  assert.match(first, /^client_[a-f0-9]{32}$/);
  assert.equal(first.includes(sessionId), false);
});

test("different sessions receive different client identifiers", () => {
  assert.notEqual(clientIdForSession("session-a"), clientIdForSession("session-b"));
});

test("schema defines relational storage and queue indexes", () => {
  const schema = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");

  for (const table of ["clients", "dialogs", "messages", "app_state"]) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  assert.match(schema, /REFERENCES clients\(id\)/);
  assert.match(schema, /REFERENCES dialogs\(id\) ON DELETE CASCADE/);
  assert.match(schema, /dialogs_queue_idx/);
  assert.match(schema, /messages_dialog_created_idx/);
});

test("saveStore commits clients, dialogs and messages in one checked-out transaction", async () => {
  const queries = [];
  let released = false;

  class FakePool {
    on() {}

    async connect() {
      return {
        query: async (sql, values = []) => {
          queries.push({ sql: String(sql).trim(), values });
          return { rows: [] };
        },
        release: () => {
          released = true;
        }
      };
    }
  }

  const repository = createPostgresDialogRepository({
    connectionString: "postgresql://test",
    PoolClass: FakePool
  });
  await repository.saveStore({
    counter: 1045,
    leads: [
      {
        id: "dialog-1",
        number: 1045,
        sessionId: "session-1",
        status: "queued",
        topic: "Печать",
        clientName: "Клиент",
        clientEmail: "client@example.test",
        createdAt: "2026-07-26T10:00:00.000Z",
        updatedAt: "2026-07-26T10:00:01.000Z",
        messages: [
          {
            id: "message-1",
            channel: "client",
            text: "Нужен расчет",
            createdAt: "2026-07-26T10:00:01.000Z"
          }
        ]
      }
    ]
  });

  assert.equal(queries[0].sql, "BEGIN");
  assert.equal(queries.at(-1).sql, "COMMIT");
  assert.equal(released, true);
  assert.equal(queries.some(({ sql }) => sql.includes("INSERT INTO clients")), true);
  assert.equal(queries.some(({ sql }) => sql.includes("INSERT INTO dialogs")), true);
  assert.equal(queries.some(({ sql }) => sql.includes("INSERT INTO messages")), true);
  assert.equal(queries.some(({ sql }) => sql.includes("$1")), true);
});

test("saveStore rolls back and releases the client when a query fails", async () => {
  const commands = [];
  let released = false;

  class FailingPool {
    on() {}

    async connect() {
      return {
        query: async (sql) => {
          const command = String(sql).trim();
          commands.push(command);
          if (command.includes("INSERT INTO app_state")) {
            throw new Error("database write failed");
          }
          return { rows: [] };
        },
        release: () => {
          released = true;
        }
      };
    }
  }

  const repository = createPostgresDialogRepository({
    connectionString: "postgresql://test",
    PoolClass: FailingPool
  });

  await assert.rejects(
    repository.saveStore({ counter: 1044, leads: [] }),
    /database write failed/
  );
  assert.equal(commands[0], "BEGIN");
  assert.equal(commands.at(-1), "ROLLBACK");
  assert.equal(released, true);
});
