import "server-only";
import { execFile } from "node:child_process";
import type { InboundMessage, MessageProvider, SendResult } from "./types";

/**
 * Adapter Hermes Agent (Nous Research) — gateway local.
 * Envio: `hermes send --to whatsapp:<jid> "<texto>"` (CLI, sem LLM, sem fila frágil).
 * Inbound NÃO vem por webhook: o histórico é espelhado de ~/.hermes/state.db
 * pelo serviço hermes-sync (o gateway do Hermes é quem responde as conversas).
 */
export function createHermesProvider(cfg: { bin: string; home: string }): MessageProvider {
  /** Telefone cru vira 55…@s.whatsapp.net; jid completo (@lid/@s.whatsapp.net) vai como está. */
  function toJid(to: string): string {
    const v = String(to).trim();
    if (v.includes("@")) return v;
    const n = v.replace(/\D/g, "");
    if (n.length <= 11) return `55${n}`;
    return `${n}@s.whatsapp.net`;
  }

  async function sendText(accountId: string, to: string, text: string): Promise<SendResult> {
    if (!cfg.bin) return { ok: false, error: "Hermes: binário não configurado (HERMES_BIN)" };

    return new Promise((resolve) => {
      execFile(
        cfg.bin,
        ["send", "--to", `whatsapp:${toJid(to)}`, text],
        {
          timeout: 30_000,
          env: { ...process.env, HERMES_HOME: cfg.home, HOME: cfg.home.replace(/\/\.hermes$/, "") },
        },
        (err, stdout, stderr) => {
          if (err) {
            resolve({ ok: false, error: (stderr || err.message).slice(0, 300) });
            return;
          }
          const out = String(stdout).trim();
          if (/\bsent\b/i.test(out) || !err) resolve({ ok: true, externalMessageId: `hermes_${Date.now()}` });
          else resolve({ ok: false, error: out.slice(0, 300) || "Hermes: saída vazia" });
        },
      );
    });
  }

  return {
    name: "hermes",

    verifySignature(): boolean {
      return true; // sem webhook de entrada — sync por state.db
    },

    parseInbound(): InboundMessage[] {
      return [];
    },

    sendText,

    async sendTemplate(_accountId, to, templateName, variables) {
      const rendered = String(templateName).replace(/\{\{(\w+)\}\}/g, (_, k) => variables?.[k] ?? "");
      return sendText(_accountId, to, rendered || templateName);
    },

    async markRead() {
      // Hermes envia receipt próprio via gateway — dispensado aqui
    },
  };
}
