import { test } from "node:test";
import assert from "node:assert/strict";
import { hoursSince, isFollowupEligible, readFollowupCount } from "./followup-rules.ts";

const NOW = new Date("2026-10-05T12:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

test("elegível: contato feito há 30h, sem resposta, sem retomada", () => {
  assert.equal(
    isFollowupEligible({
      firstTouchAt: hoursAgo(30),
      lastInboundAt: null,
      now: NOW,
      minHours: 24,
      followupsSent: 0,
      maxFollowups: 1,
    }),
    true,
  );
});

test("não elegível antes do tempo mínimo", () => {
  assert.equal(
    isFollowupEligible({
      firstTouchAt: hoursAgo(5),
      lastInboundAt: null,
      now: NOW,
      minHours: 24,
      followupsSent: 0,
      maxFollowups: 1,
    }),
    false,
  );
});

test("não elegível quando o lead respondeu depois do primeiro contato", () => {
  assert.equal(
    isFollowupEligible({
      firstTouchAt: hoursAgo(48),
      lastInboundAt: hoursAgo(40),
      now: NOW,
      minHours: 24,
      followupsSent: 0,
      maxFollowups: 1,
    }),
    false,
  );
});

test("resposta anterior ao contato não bloqueia o follow-up", () => {
  assert.equal(
    isFollowupEligible({
      firstTouchAt: hoursAgo(30),
      lastInboundAt: hoursAgo(60),
      now: NOW,
      minHours: 24,
      followupsSent: 0,
      maxFollowups: 1,
    }),
    true,
  );
});

test("não elegível quando já estourou o limite de retomadas", () => {
  assert.equal(
    isFollowupEligible({
      firstTouchAt: hoursAgo(100),
      lastInboundAt: null,
      now: NOW,
      minHours: 24,
      followupsSent: 1,
      maxFollowups: 1,
    }),
    false,
  );
});

test("não elegível sem primeiro contato registrado", () => {
  assert.equal(
    isFollowupEligible({
      firstTouchAt: null,
      lastInboundAt: null,
      now: NOW,
      minHours: 24,
      followupsSent: 0,
      maxFollowups: 1,
    }),
    false,
  );
});

test("readFollowupCount lê o marcador em custom_fields", () => {
  assert.equal(readFollowupCount({ followup: { count: 2 } }), 2);
  assert.equal(readFollowupCount({ followup: {} }), 0);
  assert.equal(readFollowupCount({}), 0);
  assert.equal(readFollowupCount(null), 0);
  assert.equal(readFollowupCount("texto"), 0);
});

test("hoursSince arredonda as horas desde o contato", () => {
  assert.equal(hoursSince(hoursAgo(30), NOW), 30);
  assert.equal(hoursSince("data-invalida", NOW), 0);
});
