import "server-only";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { serverEnv } from "@/lib/env";

const execFileAsync = promisify(execFile);

/**
 * E-mail pela plataforma nativa do Hermes (IMAP recebe / SMTP envia).
 * Não usa Gmail API nem OAuth: basta EMAIL_ADDRESS/EMAIL_PASSWORD no .env do Hermes.
 * O envio é feito pelo CLI (`hermes send --to email:<destino> --subject ...`).
 */

export type HermesEmailStatus = {
  configured: boolean;
  address: string | null;
  reason?: string;
};

function readHermesEnv(): Record<string, string> {
  const { hermes } = serverEnv();
  if (!hermes.home) return {};
  try {
    const raw = readFileSync(`${hermes.home}/.env`, "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

/** O e-mail está pronto no Hermes? (endereço + senha preenchidos) */
export function hermesEmailStatus(): HermesEmailStatus {
  const { hermes } = serverEnv();
  if (!hermes.bin || !hermes.home) {
    return { configured: false, address: null, reason: "Hermes não configurado (HERMES_BIN/HERMES_HOME)" };
  }
  const env = readHermesEnv();
  const address = env.EMAIL_ADDRESS?.trim() ?? "";
  const password = env.EMAIL_PASSWORD?.trim() ?? "";

  if (!address || !password) {
    return {
      configured: false,
      address: address || null,
      reason: "Preencha EMAIL_ADDRESS e EMAIL_PASSWORD no .env do Hermes (Gmail: senha de app)",
    };
  }
  return { configured: true, address };
}

export type HermesEmailResult =
  | { ok: true; to: string }
  | { ok: false; error: string };

/** Envia um e-mail usando a conta configurada no Hermes. */
export async function sendEmailViaHermes(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<HermesEmailResult> {
  const { hermes } = serverEnv();
  const status = hermesEmailStatus();
  if (!status.configured) {
    return { ok: false, error: status.reason ?? "E-mail do Hermes não configurado" };
  }

  try {
    const { stdout } = await execFileAsync(
      hermes.bin,
      ["send", "--to", `email:${params.to}`, "--subject", params.subject, params.text],
      {
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, HERMES_HOME: hermes.home },
      },
    );
    const out = String(stdout ?? "");
    if (/sent|enviado|ok/i.test(out) || out.trim() === "") {
      return { ok: true, to: params.to };
    }
    return { ok: false, error: out.trim().slice(0, 200) || "resposta inesperada do Hermes" };
  } catch (error) {
    const err = error as Error & { stderr?: string };
    return { ok: false, error: (err.stderr || err.message).slice(0, 300) };
  }
}
