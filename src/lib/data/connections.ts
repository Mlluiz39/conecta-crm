"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { ChannelType } from "@/types/domain";

export interface ConnectionsConfig {
  zernio: {
    apiKey: string;
    apiUrl: string;
    webhookSecret: string;
    defaultAccountId: string;
    status: "conectado" | "desconectado" | "erro";
  };
  apify: {
    apiToken: string;
    status: "conectado" | "desconectado";
  };
  aisa: {
    apiKey: string;
    apiUrl: string;
    status: "conectado" | "desconectado";
  };
}

const DEFAULT_CONFIG: ConnectionsConfig = {
  zernio: {
    apiKey: "",
    apiUrl: "https://api.zernio.com",
    webhookSecret: "",
    defaultAccountId: "",
    status: "desconectado",
  },
  apify: {
    apiToken: "",
    status: "desconectado",
  },
  aisa: {
    apiKey: "",
    apiUrl: "https://api.aisa.ai",
    status: "desconectado",
  },
};

export async function getConnections() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const [{ data: org }, { data: channels }] = await Promise.all([
    supabase
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .single(),
    supabase
      .from("channels")
      .select("id, type, name, cernio_channel_id, status, config, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
  ]);

  const rawConn = (org?.settings as any)?.connections || {};

  // Se não encontrou em org.settings, busca nas configs dos canais
  const zernioChannel = (channels || []).find((c) => (c.config as any)?.apiKey);
  const fallbackZernio = (zernioChannel?.config as any) || {};

  const config: ConnectionsConfig = {
    zernio: {
      ...DEFAULT_CONFIG.zernio,
      ...fallbackZernio,
      ...(rawConn.zernio || {}),
    },
    apify: { ...DEFAULT_CONFIG.apify, ...(rawConn.apify || {}) },
    aisa: { ...DEFAULT_CONFIG.aisa, ...(rawConn.aisa || {}) },
  };

  return {
    config,
    channels: channels || [],
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  };
}

export async function saveZernioConfig(formData: FormData) {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Apenas administradores ou gerentes podem alterar conexões");

  const supabase = createClient();
  const apiKey = String(formData.get("apiKey") || "").trim();
  const apiUrl = String(formData.get("apiUrl") || "https://api.zernio.com").trim();
  const webhookSecret = String(formData.get("webhookSecret") || "").trim();
  const defaultAccountId = String(formData.get("defaultAccountId") || "").trim();

  // 1. Atualiza na tabela channels (que sempre possui a coluna config)
  const channelIdentifier = defaultAccountId || "default";
  await supabase
    .from("channels")
    .upsert(
      {
        organization_id: organizationId,
        type: "whatsapp",
        name: "Zernio WhatsApp",
        cernio_channel_id: channelIdentifier,
        status: apiKey ? "conectado" : "desconectado",
        config: {
          apiKey,
          apiUrl,
          webhookSecret,
          defaultAccountId: channelIdentifier,
        },
      },
      { onConflict: "organization_id,type,cernio_channel_id" },
    );

  // 2. Se a coluna settings existir em organizations, atualiza também lá
  try {
    const { data: org } = await supabase.from("organizations").select("*").eq("id", organizationId).single();
    if (org && "settings" in org) {
      const currentSettings = (org.settings as any) || {};
      const currentConnections = currentSettings.connections || {};

      const updatedConnections = {
        ...currentConnections,
        zernio: {
          apiKey,
          apiUrl,
          webhookSecret,
          defaultAccountId,
          status: apiKey ? "conectado" : "desconectado",
        },
      };

      await supabase
        .from("organizations")
        .update({
          settings: { ...currentSettings, connections: updatedConnections },
          updated_at: new Date().toISOString(),
        })
        .eq("id", organizationId);
    }
  } catch (err) {
    // Caso a coluna settings ainda não tenha sido criada no Postgres, o canal em channels já garantiu o salvamento
    console.warn("[saveZernioConfig] organizations.settings não disponível ainda:", err);
  }

  revalidatePath("/conexoes");
}

export async function saveApifyConfig(formData: FormData) {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Apenas administradores ou gerentes podem alterar conexões");

  const supabase = createClient();
  const apiToken = String(formData.get("apiToken") || "").trim();

  try {
    const { data: org } = await supabase.from("organizations").select("*").eq("id", organizationId).single();
    if (org && "settings" in org) {
      const currentSettings = (org.settings as any) || {};
      const currentConnections = currentSettings.connections || {};

      const updatedConnections = {
        ...currentConnections,
        apify: {
          apiToken,
          status: apiToken ? "conectado" : "desconectado",
        },
      };

      await supabase
        .from("organizations")
        .update({
          settings: { ...currentSettings, connections: updatedConnections },
          updated_at: new Date().toISOString(),
        })
        .eq("id", organizationId);
    }
  } catch (err) {
    console.warn("[saveApifyConfig] organizations.settings:", err);
  }

  revalidatePath("/conexoes");
}

export async function saveAisaConfig(formData: FormData) {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Apenas administradores ou gerentes podem alterar conexões");

  const supabase = createClient();
  const apiKey = String(formData.get("apiKey") || "").trim();
  const apiUrl = String(formData.get("apiUrl") || "https://api.aisa.ai").trim();

  try {
    const { data: org } = await supabase.from("organizations").select("*").eq("id", organizationId).single();
    if (org && "settings" in org) {
      const currentSettings = (org.settings as any) || {};
      const currentConnections = currentSettings.connections || {};

      const updatedConnections = {
        ...currentConnections,
        aisa: {
          apiKey,
          apiUrl,
          status: apiKey ? "conectado" : "desconectado",
        },
      };

      await supabase
        .from("organizations")
        .update({
          settings: { ...currentSettings, connections: updatedConnections },
          updated_at: new Date().toISOString(),
        })
        .eq("id", organizationId);
    }
  } catch (err) {
    console.warn("[saveAisaConfig] organizations.settings:", err);
  }

  revalidatePath("/conexoes");
}

export async function createChannel(formData: FormData) {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Sem permissão");

  const supabase = createClient();
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "whatsapp") as ChannelType;
  const cernioChannelId = String(formData.get("cernio_channel_id") || "").trim();

  const { error } = await supabase.from("channels").insert({
    organization_id: organizationId,
    name,
    type,
    cernio_channel_id: cernioChannelId || null,
    status: "conectado",
  });

  if (error) throw new Error(error.message);
  revalidatePath("/conexoes");
}

export async function deleteChannel(channelId: string) {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Sem permissão");

  const supabase = createClient();
  const { error } = await supabase
    .from("channels")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", channelId);

  if (error) throw new Error(error.message);
  revalidatePath("/conexoes");
}
