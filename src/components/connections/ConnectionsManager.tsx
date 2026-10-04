"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Globe,
  Bot,
  Calendar,
  CheckCircle2,
  Copy,
  Check,
  Plus,
  Trash2,
  ExternalLink,
  Key,
  ShieldCheck,
} from "lucide-react";
import {
  saveZernioConfig,
  saveApifyConfig,
  saveAisaConfig,
  createChannel,
  deleteChannel,
  type ConnectionsConfig,
} from "@/lib/data/connections";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { CHANNEL_LABEL, type ChannelType } from "@/types/domain";

export function ConnectionsManager({
  config,
  channels,
  appUrl,
}: {
  config: ConnectionsConfig;
  channels: any[];
  appUrl: string;
}) {
  const router = useRouter();
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [savingZernio, setSavingZernio] = useState(false);
  const [savingApify, setSavingApify] = useState(false);
  const [savingAisa, setSavingAisa] = useState(false);

  const webhookUrl = `${appUrl}/api/webhooks/zernio`;

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conexões & Integrações"
        subtitle="Gerencie suas conexões com Zernio (WhatsApp), Apify, AISA e Google Calendar"
      />

      {/* Grid de Integrações */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 1. ZERNIO (WhatsApp e Redes Sociais) */}
        <Card className="flex flex-col justify-between space-y-4 border-emerald-500/20 shadow-sm">
          <div>
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading text-base font-bold">Zernio API</h3>
                    <Badge
                      className={
                        config.zernio.status === "conectado"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {config.zernio.status === "conectado" ? "Conectado" : "Desconectado"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Envio e recepção de mensagens do WhatsApp, Instagram e Messenger
                  </p>
                </div>
              </div>
              <a
                href="https://docs.zernio.com/comments/list-inbox-comments"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
              >
                <span>Docs</span>
                <ExternalLink size={12} />
              </a>
            </div>

            {/* URL do Webhook */}
            <div className="mt-4 rounded-xl border bg-muted/40 p-3">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                URL do Webhook (Cole no painel da Zernio)
              </label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={webhookUrl}
                  className="w-full rounded-lg border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(webhookUrl)}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
                >
                  {copiedWebhook ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedWebhook ? "Copiado!" : "Copiar"}</span>
                </button>
              </div>
            </div>

            {/* Formulário de Configuração Zernio */}
            <form
              action={async (fd) => {
                setSavingZernio(true);
                try {
                  await saveZernioConfig(fd);
                  router.refresh();
                } finally {
                  setSavingZernio(false);
                }
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Zernio API Key / Bearer Token
                </label>
                <div className="relative">
                  <input
                    name="apiKey"
                    type="password"
                    defaultValue={config.zernio.apiKey}
                    placeholder="zr_live_..."
                    className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Key size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                    Zernio API Endpoint
                  </label>
                  <input
                    name="apiUrl"
                    defaultValue={config.zernio.apiUrl}
                    placeholder="https://api.zernio.com"
                    className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                    Webhook Secret (Opcional)
                  </label>
                  <input
                    name="webhookSecret"
                    type="password"
                    defaultValue={config.zernio.webhookSecret}
                    placeholder="Segredo de validação HMAC"
                    className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingZernio}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {savingZernio ? "Salvando..." : "Salvar Configuração Zernio"}
                </button>
              </div>
            </form>
          </div>

          {/* Canais conectados */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Canais & Instâncias Cadastradas ({channels.length})
              </h4>
              <button
                type="button"
                onClick={() => setShowChannelModal(true)}
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <Plus size={14} /> Novo Canal
              </button>
            </div>

            {channels.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                Nenhum canal cadastrado ainda. Clique em "+ Novo Canal" para vincular um número ou página.
              </p>
            ) : (
              <div className="space-y-1.5">
                {channels.map((ch) => (
                  <div key={ch.id} className="flex items-center justify-between rounded-xl border p-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{ch.name}</span>
                      <Badge className="bg-primary/10 text-primary capitalize">
                        {CHANNEL_LABEL[ch.type as ChannelType] || ch.type}
                      </Badge>
                      {ch.cernio_channel_id && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          ID: {ch.cernio_channel_id}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        await deleteChannel(ch.id);
                        router.refresh();
                      }}
                      className="text-muted-foreground hover:text-destructive p-1 rounded-lg"
                      title="Excluir canal"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* 2. APIFY */}
        <Card className="flex flex-col justify-between space-y-4 shadow-sm">
          <div>
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                  <Globe size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading text-base font-bold">Apify API</h3>
                    <Badge
                      className={
                        config.apify.status === "conectado"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {config.apify.status === "conectado" ? "Ativo" : "Não configurado"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Extração de leads, automações web e enriquecimento de contatos
                  </p>
                </div>
              </div>
              <a
                href="https://docs.apify.com/api/v2"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
              >
                <span>Docs</span>
                <ExternalLink size={12} />
              </a>
            </div>

            <form
              action={async (fd) => {
                setSavingApify(true);
                try {
                  await saveApifyConfig(fd);
                  router.refresh();
                } finally {
                  setSavingApify(false);
                }
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Apify Personal API Token
                </label>
                <div className="relative">
                  <input
                    name="apiToken"
                    type="password"
                    defaultValue={config.apify.apiToken}
                    placeholder="apify_api_..."
                    className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Key size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Como usar no ConectaCRM:</p>
                <p>• Coleta automatizada de leads do Google Maps, Instagram e LinkedIn</p>
                <p>• Enriquecimento de cadastros de contatos</p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingApify}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {savingApify ? "Salvando..." : "Salvar Apify"}
                </button>
              </div>
            </form>
          </div>
        </Card>

        {/* 3. AISA */}
        <Card className="flex flex-col justify-between space-y-4 shadow-sm">
          <div>
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  <Bot size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading text-base font-bold">AISA API</h3>
                    <Badge
                      className={
                        config.aisa.status === "conectado"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {config.aisa.status === "conectado" ? "Ativo" : "Não configurado"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Serviços de automação avançada de inteligência artificial
                  </p>
                </div>
              </div>
            </div>

            <form
              action={async (fd) => {
                setSavingAisa(true);
                try {
                  await saveAisaConfig(fd);
                  router.refresh();
                } finally {
                  setSavingAisa(false);
                }
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  AISA API Key / Token
                </label>
                <div className="relative">
                  <input
                    name="apiKey"
                    type="password"
                    defaultValue={config.aisa.apiKey}
                    placeholder="aisa_key_..."
                    className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Key size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  AISA API Endpoint (Opcional)
                </label>
                <input
                  name="apiUrl"
                  defaultValue={config.aisa.apiUrl}
                  placeholder="https://api.aisa.ai"
                  className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingAisa}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {savingAisa ? "Salvando..." : "Salvar AISA"}
                </button>
              </div>
            </form>
          </div>
        </Card>

        {/* 4. GOOGLE CALENDAR */}
        <Card className="flex flex-col justify-between space-y-4 shadow-sm">
          <div>
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  <Calendar size={20} />
                </div>
                <div>
                  <h3 className="font-heading text-base font-bold">Google Calendar</h3>
                  <p className="text-xs text-muted-foreground">
                    Sincronização bidirecional de reuniões e visitas agendadas
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Permite que os agentes de IA consultem horários livres e marquem visitas diretamente na sua agenda Google.
              </p>
              <div className="pt-2">
                <a
                  href="/api/integrations/google/connect"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90"
                >
                  <Calendar size={14} />
                  <span>Conectar Conta Google</span>
                </a>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Modal Novo Canal */}
      {showChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold">Adicionar Novo Canal Zernio</h3>

            <form
              action={async (fd) => {
                await createChannel(fd);
                setShowChannelModal(false);
                router.refresh();
              }}
              className="space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Nome amigável do Canal
                </label>
                <input
                  name="name"
                  required
                  placeholder="Ex: WhatsApp Vendas Matriz"
                  className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Tipo de Plataforma
                </label>
                <select name="type" className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none">
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram Direct</option>
                  <option value="messenger">Facebook Messenger</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  ID do Canal / Instância no Zernio
                </label>
                <input
                  name="cernio_channel_id"
                  placeholder="Ex: inst_whatsapp_01 ou +5511999998888"
                  className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChannelModal(false)}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
                >
                  Salvar Canal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
