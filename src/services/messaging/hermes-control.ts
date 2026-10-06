import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { serverEnv } from "@/lib/env";

const execFileAsync = promisify(execFile);

/**
 * Controle do bot do Hermes (“assumir conversa”).
 *
 * Usa o **emergency stop** do Hermes, que para apenas trabalho NOVO
 * (novos turnos do gateway, cron e kanban) sem derrubar o WhatsApp nem matar
 * o que está em andamento. O estado vive no sentinel `ESTOP` dentro do HERMES_HOME.
 *
 * Alternativa pelo celular (sem o cliente ver): mandar `/pause` na conversa com
 * o próprio número e `/pause off` para retomar.
 */

function estopPath(): string | null {
  const { hermes } = serverEnv();
  if (!hermes.home) return null;
  return `${hermes.home}/ESTOP`;
}

export type BotState = {
  paused: boolean;
  reason: string | null;
  path: string | null;
  available: boolean;
};

/** O bot está pausado (você no controle)? */
export function hermesBotState(): BotState {
  const { hermes } = serverEnv();
  const path = estopPath();
  if (!hermes.bin || !path) {
    return { paused: false, reason: null, path, available: false };
  }
  const paused = existsSync(path);
  return { paused, reason: paused ? "assumido pelo CRM" : null, path, available: true };
}

async function runHermes(args: string[]): Promise<{ ok: boolean; output: string }> {
  const { hermes } = serverEnv();
  if (!hermes.bin) return { ok: false, output: "HERMES_BIN não configurado" };
  try {
    const { stdout, stderr } = await execFileAsync(hermes.bin, args, {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, HERMES_HOME: hermes.home, HOME: hermes.home.replace(/\/\.hermes$/, "") },
    });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const err = error as Error & { stderr?: string };
    return { ok: false, output: (err.stderr || err.message).slice(0, 300) };
  }
}

/** Pausa o bot (para de responder novos turnos). */
export async function pauseHermesBot(reason = "assumido no CRM"): Promise<{ ok: boolean; output: string }> {
  return runHermes(["pause", "--reason", reason]);
}

/** Retoma o bot. */
export async function resumeHermesBot(): Promise<{ ok: boolean; output: string }> {
  return runHermes(["resume"]);
}
