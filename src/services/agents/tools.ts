import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentToolKey } from "@/types/domain";
import type { ToolSchema } from "./claude";

/** Contexto server-side disponível para os handlers das ferramentas. */
export type AgentToolContext = {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
  contactId: string;
  opportunityId?: string | null;
};

type ToolDef = {
  key: AgentToolKey;
  schema: ToolSchema;
  handler: (ctx: AgentToolContext, input: any) => Promise<unknown>;
};

const registry: Record<AgentToolKey, ToolDef> = {
  buscar_informacoes: {
    key: "buscar_informacoes",
    schema: {
      name: "buscar_informacoes",
      description:
        "Busca na base de conhecimento da empresa (serviços, preços, prazos, endereço, políticas). Chame quando o cliente perguntar qualquer coisa factual sobre a empresa que você precise consultar.",
      input_schema: {
        type: "object",
        properties: {
          consulta: { type: "string", description: "O que o cliente quer saber." },
        },
        required: ["consulta"],
      },
    },
    async handler(ctx, input) {
      const consulta = String(input.consulta ?? "");

      // 1. Busca full-text (português)
      let { data } = await ctx.supabase
        .from("knowledge_base_items")
        .select("title, content")
        .eq("organization_id", ctx.organizationId)
        .textSearch("search", consulta, {
          config: "portuguese",
          type: "websearch",
        })
        .limit(3);

      // 2. Fallback ILIKE quando full-text não casa (ex: "web site" vs "site")
      if (!data?.length) {
        const q = `%${consulta.replace(/[,%()\\]/g, " ").trim()}%`;
        const [byTitle, byContent] = await Promise.all([
          ctx.supabase
            .from("knowledge_base_items")
            .select("title, content")
            .eq("organization_id", ctx.organizationId)
            .ilike("title", q)
            .limit(3),
          ctx.supabase
            .from("knowledge_base_items")
            .select("title, content")
            .eq("organization_id", ctx.organizationId)
            .ilike("content", q)
            .limit(3),
        ]);
        const merged = [...(byTitle.data ?? []), ...(byContent.data ?? [])];
        data = [...new Map(merged.map((d: any) => [d.title, d])).values()].slice(0, 3) as any;
      }

      const resultados = (data ?? []).map((d: any) => ({
        titulo: d.title,
        trecho: String(d.content).slice(0, 500),
      }));

      return {
        resultados,
        total: resultados.length,
        aviso:
          resultados.length === 0
            ? "Nada encontrado na base. Não invente: diga que vai confirmar com a equipe e, se fizer sentido, derive para humano."
            : undefined,
      };
    },
  },

  agendar_visita: {
    key: "agendar_visita",
    schema: {
      name: "agendar_visita",
      description:
        "Agenda uma visita/reunião/consulta. Chame APENAS quando o cliente já tiver confirmado a especialidade/serviço, dia e horário desejados.",
      input_schema: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          inicio: { type: "string", description: "Data/hora ISO 8601." },
          duracao_minutos: { type: "integer", default: 30 },
          local: { type: "string", description: "Local ou link de reunião." },
        },
        required: ["titulo", "inicio"],
      },
    },
    async handler(ctx, input) {
      const starts = new Date(String(input.inicio));
      if (Number.isNaN(starts.getTime())) throw new Error("Data de início inválida");
      const minutes = Number(input.duracao_minutos ?? 30);
      const ends = new Date(starts.getTime() + minutes * 60_000);

      const { data, error } = await ctx.supabase
        .from("appointments")
        .insert({
          organization_id: ctx.organizationId,
          contact_id: ctx.contactId,
          opportunity_id: ctx.opportunityId ?? null,
          title: String(input.titulo),
          location: input.local ? String(input.local) : null,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          status: "agendado",
        })
        .select("id, starts_at")
        .single();
      if (error) throw new Error(error.message);
      return {
        confirmado: true,
        agendamento_id: data.id,
        inicio: data.starts_at,
        mensagem: "Compromisso agendado com sucesso.",
      };
    },
  },

  derivar_para_atendente: {
    key: "derivar_para_atendente",
    schema: {
      name: "derivar_para_atendente",
      description:
        "Transfere a conversa para um atendente humano e desativa o robô de IA.",
      input_schema: {
        type: "object",
        properties: {
          motivo: { type: "string", description: "Por que está derivando." },
        },
      },
    },
    async handler(ctx, input) {
      const { error } = await ctx.supabase
        .from("conversations")
        .update({
          bot_active: false,
          handoff_reason: "cliente_pede_humano",
          bot_disabled_at: new Date().toISOString(),
        })
        .eq("id", ctx.conversationId)
        .eq("organization_id", ctx.organizationId);
      if (error) throw new Error(error.message);

      if (input?.motivo) {
        await ctx.supabase.from("conversation_notes").insert({
          organization_id: ctx.organizationId,
          conversation_id: ctx.conversationId,
          content: `Transbordo para humano: ${input.motivo}`,
        });
      }

      return { transferido: true, motivo: input?.motivo ?? null };
    },
  },

  atualizar_contato: {
    key: "atualizar_contato",
    schema: {
      name: "atualizar_contato",
      description:
        "Atualiza dados cadastrais do contato ou preferências do tipo de negócio (ex: bairro, quartos, orçamento, convênio).",
      input_schema: {
        type: "object",
        properties: {
          nome: { type: "string" },
          email: { type: "string" },
          telefone: { type: "string" },
          campos_personalizados: {
            type: "object",
            description: "Chave e valor dos campos customizados (ex: bairro, tipo_imovel, orcamento).",
          },
        },
      },
    },
    async handler(ctx, input) {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input?.nome) patch.name = String(input.nome);
      if (input?.email) patch.email = String(input.email);
      if (input?.telefone) patch.phone = String(input.telefone);

      const custom = input?.campos_personalizados;
      if (custom && typeof custom === "object") {
        const { data: current } = await ctx.supabase
          .from("contacts")
          .select("custom_fields")
          .eq("id", ctx.contactId)
          .single();
        patch.custom_fields = { ...(current?.custom_fields ?? {}), ...custom };
      }

      const { error } = await ctx.supabase
        .from("contacts")
        .update(patch)
        .eq("id", ctx.contactId)
        .eq("organization_id", ctx.organizationId);
      if (error) throw new Error(error.message);
      return { atualizado: true, campos: Object.keys(patch) };
    },
  },

  mover_etapa_funil: {
    key: "mover_etapa_funil",
    schema: {
      name: "mover_etapa_funil",
      description:
        "Avança a oportunidade para outra etapa do funil. Chame APENAS se houver avanço real e explícito no estágio da negociação (ex: proposta enviada ou ganho). NÃO chame em saudações iniciais.",
      input_schema: {
        type: "object",
        properties: {
          etapa: { type: "string", description: "Nome da etapa do funil." },
          motivo_perda: { type: "string" },
        },
        required: ["etapa"],
      },
    },
    async handler(ctx, input) {
      if (!ctx.opportunityId) return { movido: false, motivo: "Sem oportunidade vinculada" };

      const { data: stage } = await ctx.supabase
        .from("pipeline_stages")
        .select("id, is_won, is_lost")
        .eq("organization_id", ctx.organizationId)
        .ilike("name", String(input.etapa))
        .maybeSingle();
      if (!stage) return { movido: false, motivo: "Etapa não encontrada" };

      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        stage_id: stage.id,
        updated_at: now,
      };
      if (stage.is_won || stage.is_lost) {
        patch.closed_at = now;
        if (stage.is_lost) patch.lost_reason = input?.motivo_perda ?? "Perdido";
      } else {
        patch.closed_at = null;
        patch.lost_reason = null;
      }

      const { error } = await ctx.supabase
        .from("opportunities")
        .update(patch)
        .eq("id", ctx.opportunityId)
        .eq("organization_id", ctx.organizationId);
      if (error) throw new Error(error.message);
      return { movido: true, etapa: input.etapa };
    },
  },
};

/** Schemas das ferramentas habilitadas, prontos para o Claude. */
export function toolsForClaude(enabled: AgentToolKey[]): ToolSchema[] {
  return enabled
    .filter((k) => k in registry)
    .map((k) => registry[k].schema);
}

/** Executa uma ferramenta habilitada por nome. */
export async function executeTool(
  ctx: AgentToolContext,
  enabled: AgentToolKey[],
  key: string,
  input: unknown,
): Promise<unknown> {
  if (!enabled.includes(key as AgentToolKey)) {
    throw new Error(`Ferramenta não habilitada: ${key}`);
  }
  const tool = registry[key as AgentToolKey];
  if (!tool) throw new Error(`Ferramenta desconhecida: ${key}`);
  return tool.handler(ctx, input);
}
