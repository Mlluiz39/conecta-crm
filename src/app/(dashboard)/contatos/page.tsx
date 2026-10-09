import Link from "next/link";
import { getContacts } from "@/lib/data/queries";
import { PageHeader, Card, EmptyState, Badge } from "@/components/ui/primitives";
import { NewContactButton } from "@/components/contacts/NewContactButton";
import { DeleteContactButton } from "@/components/contacts/DeleteContactButton";
import {
  MessageCircle,
  Eye,
  CheckCircle2,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  Building,
} from "lucide-react";

export const revalidate = 15;

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatLastInteraction(dateString?: string | null) {
  if (!dateString) return null;
  const date = new Date(dateString);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default async function ContatosPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const limit = 30;
  const { contacts, count } = await getContacts(searchParams.q, page, limit);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contatos"
        subtitle={`${count} contatos cadastrados`}
        action={<NewContactButton />}
      />

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={searchParams.q}
          placeholder="Buscar por nome, e-mail, telefone..."
          className="w-full rounded-xl border bg-card px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-md"
        />
        {searchParams.page && <input type="hidden" name="page" value="1" />}
      </form>

      {contacts.length === 0 ? (
        <EmptyState label="Nenhum contato encontrado." />
      ) : (
        <>
          <Card className="overflow-hidden p-0 border border-border/60">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Selecionar todos"
                        className="h-4 w-4 rounded border-input text-primary accent-primary"
                      />
                    </th>
                    <th className="px-4 py-3">Contato & Empresa</th>
                    <th className="px-4 py-3">Canal & Contato</th>
                    <th className="px-4 py-3">E-mail / Cidade</th>
                    <th className="px-4 py-3">Etiquetas</th>
                    <th className="px-4 py-3">Última Interação</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {contacts.map((c: any) => {
                    const custom = (c.custom_fields ?? {}) as Record<string, any>;
                    const company = custom.empresa || custom.company;
                    const role = custom.cargo || custom.role;
                    const city = custom.cidade || custom.city;
                    const state = custom.estado || custom.state;

                    // Conversa e canal
                    const convs = (c.conversations ?? []) as Array<{
                      id: string;
                      channel_type: string;
                      last_message_at: string | null;
                    }>;
                    const activeConv = convs[0];
                    const channel = activeConv?.channel_type || (c.instagram_handle ? "instagram" : "whatsapp");

                    // Tags
                    const contactTags = ((c.contact_tags ?? []) as Array<{ tag: { id: string; name: string; color: string } }>)
                      .map((ct) => ct.tag)
                      .filter(Boolean);

                    // Última interação
                    const lastInteractionDate = activeConv?.last_message_at || c.created_at;
                    const formattedLastInteraction = formatLastInteraction(lastInteractionDate);

                    return (
                      <tr key={c.id} className="transition-colors hover:bg-muted/30">
                        {/* Checkbox */}
                        <td className="px-4 py-3.5">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${c.name}`}
                            className="h-4 w-4 rounded border-input text-primary accent-primary"
                          />
                        </td>

                        {/* Contato & Empresa */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {getInitials(c.name)}
                              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
                            </div>
                            <div className="min-w-0 max-w-[14rem]">
                              <div className="flex items-center gap-1.5">
                                {/* `min-w-0` + `truncate` num elemento de bloco: nome comprido vira
                                    "Consultório Dra. Thais Nog…" em vez de esticar a tabela, e o
                                    nome inteiro fica no title (ao passar o mouse). */}
                                <Link
                                  href={`/contatos/${c.id}`}
                                  title={c.name}
                                  className="block min-w-0 truncate font-semibold text-foreground hover:text-primary transition-colors"
                                >
                                  {c.name}
                                </Link>
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {[role, company].filter(Boolean).join(" • ") || "Sem empresa"}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Canal & Contato */}
                        <td className="px-4 py-3.5">
                          <div className="space-y-1">
                            {channel === "whatsapp" && (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                <MessageCircle className="h-3 w-3" /> WhatsApp
                              </span>
                            )}
                            {channel === "instagram" && (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-500/30 bg-pink-500/10 px-2.5 py-0.5 text-xs font-medium text-pink-600 dark:text-pink-400">
                                Instagram
                              </span>
                            )}
                            {channel === "messenger" && (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                                Messenger
                              </span>
                            )}
                            <div className="text-xs text-foreground font-medium">
                              {c.phone || (c.instagram_handle ? `@${c.instagram_handle}` : "—")}
                            </div>
                          </div>
                        </td>

                        {/* E-mail / Cidade */}
                        <td className="px-4 py-3.5 text-xs">
                          <div className="truncate font-medium text-foreground max-w-[180px]">
                            {c.email || "—"}
                          </div>
                          <div className="truncate text-muted-foreground">
                            {city ? `${city}${state ? `, ${state}` : ""}` : "—"}
                          </div>
                        </td>

                        {/* Etiquetas */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {contactTags.length > 0 ? (
                              contactTags.map((tag) => (
                                <span
                                  key={tag.id}
                                  className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium"
                                  style={{
                                    backgroundColor: `${tag.color}20`,
                                    color: tag.color,
                                    border: `1px solid ${tag.color}40`,
                                  }}
                                >
                                  {tag.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>

                        {/* Última Interação */}
                        <td className="px-4 py-3.5">
                          {formattedLastInteraction ? (
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              {formattedLastInteraction}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/contatos/${c.id}`}
                              title="Visualizar detalhes"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <Link
                              href={`/conversas?contactId=${c.id}`}
                              title="Abrir conversa"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Link>
                            <DeleteContactButton id={c.id} name={c.name ?? "contato"} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Paginação */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>
              Página {page} de {Math.max(1, Math.ceil(count / limit))} ({count} contatos no total)
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={{ query: { ...searchParams, page: page - 1 } }}
                  className="rounded-lg border px-3 py-1.5 font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Anterior
                </Link>
              )}
              {page * limit < count && (
                <Link
                  href={{ query: { ...searchParams, page: page + 1 } }}
                  className="rounded-lg border px-3 py-1.5 font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Próxima
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
