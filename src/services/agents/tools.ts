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
        "Busca na base de conhecimento da empresa (preços, políticas, FAQ, catálogo). Use antes de responder dúvidas factuais.",
      input_schema: {
        type: "object",
        properties: {
          consulta: { type: "string", description: "O que o cliente quer saber." },
        },
        required: ["consulta"],
      },
    },
    async handler(ctx, input) {
      const { data } = await ctx.supabase
        .from("kb_documents")
        .select("title, content")
        .eq("organization_id", ctx.organizationId)
        .textSearch("fts", String(input.consulta), {
          config: "portuguese",
          type: "websearch",
        })
        .limit(3);
      return {
        resultados: (data ?? []).map((d: any) => ({
          titulo: d.title,
          trecho: String(d.content).slice(0, 500),
        })),
      };
    },
  },

  agendar_visita: {
    key: "agendar_visita",
    schema: {
      name: "agendar_visita",
      description:
        "Agenda uma visita/reunião para o contato. Informe título, início (ISO 8601) e duração em minutos.",
      input_schema: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          inicio: { type: "string", description: "Data/hora ISO 8601." },
          duracao_minutos: { type: "integer", default: 30 },
          tipo: {
            type: "string",
            enum: ["demo", "presencial", "followup", "onboarding", "fechamento", "consulta"],
            default: "demo",
          },
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
          type: input.tipo ?? "demo",
          channel: "presencial",
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          status: "pendente",
        })
        .select("id, starts_at")
        .single();
      if (error) throw new Error(error.message);
      return {
        confirmado: true,
        agendamento_id: data.id,
        inicio: data.starts_at,
        mensagem: "Visita agendada e pendente de confirmação.",
      };
    },
  },

  derivar_para_atendente: {
    key: "derivar_para_atendente",
    schema: {
      name: "derivar_para_atendente",
      description:
        "Transfere a conversa para um atendente humano e desliga a resposta automática.",
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
          handoff_at: new Date().toISOString(),
          handoff_reason: "cliente_pede_humano",
          status: "pendente",
        })
        .eq("id", ctx.conversationId)
        .eq("organization_id", ctx.organizationId);
      if (error) throw new Error(error.message);

      await ctx.supabase.from("activities").insert({
        organization_id: ctx.organizationId,
        contact_id: ctx.contactId,
        conversation_id: ctx.conversationId,
        type: "system",
        title: "Handoff para atendente",
        body: input?.motivo ?? null,
        actor_type: "system",
      });
      return { transferido: true, motivo: input?.motivo ?? null };
    },
  },

  atualizar_contato: {
    key: "atualizar_contato",
    schema: {
      name: "atualizar_contato",
      description:
        "Atualiza dados do contato (nome, e-mail, empresa, campos personalizados como bairro, quartos, convênio).",
      input_schema: {
        type: "object",
        properties: {
          nome: { type: "string" },
          email: { type: "string" },
          empresa: { type: "string" },
          campos_personalizados: {
            type: "object",
            description: "Chave→valor dos campos customizados do tipo de negócio.",
          },
        },
      },
    },
    async handler(ctx, input) {
      // Whitelist explícita — a IA nunca escreve colunas arbitrárias.
      const patch: Record<string, unknown> = {};
      if (input?.nome) patch.name = String(input.nome);
      if (input?.email) patch.email = String(input.email);
      if (input?.empresa) patch.company = String(input.empresa);

      const custom = input?.campos_personalizados;
      if (custom && typeof custom === "object") {
        const { data: current } = await ctx.supabase
          .from("contacts")
          .select("custom_fields")
          .eq("id", ctx.contactId)
          .single();
        patch.custom_fields = { ...(current?.custom_fields ?? {}), ...custom };
      }

      if (Object.keys(patch).length === 0) return { atualizado: false };
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
        "Move a oportunidade do contato para uma etapa do funil pelo nome. Ao mover para Perdido, informe o motivo.",
      input_schema: {
        type: "object",
        properties: {
          etapa: { type: "string", description: "Nome da etapa de destino." },
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

      let lostReasonId: string | null = null;
      if (stage.is_lost && input?.motivo_perda) {
        const { data: reason } = await ctx.supabase
          .from("loss_reasons")
          .select("id")
          .eq("organization_id", ctx.organizationId)
          .ilike("name", String(input.motivo_perda))
          .maybeSingle();
        lostReasonId = reason?.id ?? null;
      }

      const patch: Record<string, unknown> = {
        pipeline_stage_id: stage.id,
        last_activity_at: new Date().toISOString(),
      };
      if (stage.is_won) { patch.status = "won"; patch.won_at = new Date().toISOString(); }
      else if (stage.is_lost) { patch.status = "lost"; patch.lost_at = new Date().toISOString(); patch.lost_reason_id = lostReasonId; }
      else { patch.status = "open"; }

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

/** Executa uma ferramenta habilitada por nome (nunca uma desabilitada). */
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
