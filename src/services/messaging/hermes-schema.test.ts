import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { messageUidSelect } from "./hermes-schema.ts";

/** Cria um state.db em memória com (ou sem) a coluna message_uid. */
function dbDeTeste(comUid: boolean): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  const colunas = ["id", "session_id", "role", "content", "timestamp"];
  if (comUid) colunas.push("message_uid");
  db.exec(`create table messages (${colunas.map((c) => `${c} ${c === "id" ? "integer primary key" : "text"}`).join(", ")})`);
  return db;
}

test("schema novo: usa a coluna message_uid", () => {
  const db = dbDeTeste(true);
  assert.equal(messageUidSelect(db), "message_uid");
  db.close();
});

test("schema antigo: cai para NULL AS message_uid (não quebra a query)", () => {
  const db = dbDeTeste(false);
  assert.equal(messageUidSelect(db), "NULL AS message_uid");
  db.close();
});

test("a query montada roda nos dois schemas e devolve a chave", () => {
  for (const comUid of [true, false]) {
    const db = dbDeTeste(comUid);
    db.exec(
      comUid
        ? "insert into messages (id, role, content, timestamp, message_uid) values (7, 'assistant', 'oi', 1, 'uid-abc')"
        : "insert into messages (id, role, content, timestamp) values (7, 'assistant', 'oi', 1)",
    );
    const sql = `SELECT id, role, content, timestamp, ${messageUidSelect(db)} FROM messages WHERE role IN ('user','assistant')`;
    const linhas = db.prepare(sql).all() as { id: number; message_uid: string | null }[];
    assert.equal(linhas.length, 1);
    // Com a coluna, a chave é o uid; sem ela, o id da linha assume o papel.
    assert.equal(linhas[0].message_uid, comUid ? "uid-abc" : null);
    assert.equal(`hermes_${linhas[0].message_uid ?? linhas[0].id}`, comUid ? "hermes_uid-abc" : "hermes_7");
    db.close();
  }
});

test("tabela messages inexistente não explode a montagem do SELECT", () => {
  const db = new DatabaseSync(":memory:");
  assert.equal(messageUidSelect(db), "NULL AS message_uid");
  db.close();
});
