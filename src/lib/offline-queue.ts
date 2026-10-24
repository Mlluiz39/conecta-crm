/**
 * Fila de ações feitas sem conexão.
 *
 * Na rua o sinal cai no meio da prospecção. Em vez de perder a marcação de
 * temperatura ou o valor do lead, a ação fica guardada no aparelho e é enviada
 * quando a conexão volta.
 *
 * Escopo deliberado: só entram aqui ações pequenas e idempotentes (gravar
 * temperatura e valor). Enviar mensagem, agendar e disparar prospecção NÃO
 * entram — essas precisam de resposta na hora e de decisão do servidor.
 */

export type AcaoOffline =
  | {
      id: string;
      tipo: "temperatura";
      contatoId: string;
      temperatura: "frio" | "morno" | "quente" | null;
      criadaEm: string;
    }
  | {
      id: string;
      tipo: "valor";
      contatoId: string;
      valor: number;
      criadaEm: string;
    };

/** Omit que funciona em união (o Omit comum colapsa para as chaves comuns). */
type SemId<T> = T extends unknown ? Omit<T, "id" | "criadaEm"> : never;

const CHAVE = "crm-fila-offline";
const EVENTO = "crm-fila-mudou";

function ler(): AcaoOffline[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHAVE);
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? (lista as AcaoOffline[]) : [];
  } catch {
    return [];
  }
}

function gravar(lista: AcaoOffline[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    /* modo privado: a ação se perde, mas o app não quebra */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

/** Fila atual (mais antigas primeiro). */
export function listarFila(): AcaoOffline[] {
  return ler();
}

export function tamanhoFila(): number {
  return ler().length;
}

/** Guarda uma ação para enviar depois. */
export function enfileirar(acao: SemId<AcaoOffline>): AcaoOffline {
  const nova = {
    ...acao,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    criadaEm: new Date().toISOString(),
  } as AcaoOffline;
  gravar([...ler(), nova]);
  return nova;
}

export function limparFila() {
  gravar([]);
}

/** Avisa quando a fila muda (para a tela mostrar o contador). */
export function observarFila(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENTO, callback);
    window.removeEventListener("storage", callback);
  };
}

export type ResultadoSincronizacao = { enviadas: number; falharam: number; restantes: number };

/**
 * Envia a fila ao servidor. Sucesso sai da fila; falha continua guardada
 * (o usuário vê o contador e pode tentar de novo).
 */
export async function sincronizarFila(): Promise<ResultadoSincronizacao> {
  const fila = ler();
  if (fila.length === 0) return { enviadas: 0, falharam: 0, restantes: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { enviadas: 0, falharam: 0, restantes: fila.length };
  }

  let enviadas = 0;
  const naoEnviadas: AcaoOffline[] = [];

  try {
    const res = await fetch("/api/fila-offline", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acoes: fila }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { aplicadas?: string[] };
    const aplicadas = new Set(json.aplicadas ?? []);
    for (const acao of fila) {
      if (aplicadas.has(acao.id)) enviadas++;
      else naoEnviadas.push(acao);
    }
  } catch {
    // servidor fora do ar ou ainda sem rede: mantém tudo
    return { enviadas: 0, falharam: 0, restantes: fila.length };
  }

  gravar(naoEnviadas);
  return { enviadas, falharam: naoEnviadas.length, restantes: naoEnviadas.length };
}
