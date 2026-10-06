import {
  getContacts,
  getContactedContactIds,
  getProspectStats,
  getRecentSearches,
} from "@/lib/data/queries";
import { requireProfile } from "@/lib/auth/session";
import { gmailStatus } from "@/services/email/gmail";
import { hermesEmailStatus } from "@/services/email/hermes-email";
import { ProspectPanel } from "@/components/prospecting/ProspectPanel";
import { ImportLeadsPanel } from "@/components/prospecting/ImportLeadsPanel";
import { CompanySearchPanel } from "@/components/prospecting/CompanySearchPanel";
import { BulkCleanupPanel } from "@/components/prospecting/BulkCleanupPanel";
import { LiveProspectingPanel } from "@/components/prospecting/LiveProspectingPanel";
import { OutreachCyclePanel } from "@/components/prospecting/OutreachCyclePanel";
import { countContactsByFilter, getOutreachStatus } from "@/lib/data/actions";
import { temperatureFromTagNames } from "@/lib/data/lead-temperature";
import { Breadcrumbs } from "@/components/ui/primitives";
import { ManualProspectPanel } from "@/components/prospecting/ManualProspectPanel";

export const revalidate = 10;

export default async function ProspeccaoPage({
  searchParams,
}: {
  searchParams: { search?: string; page?: string };
}) {
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const search = searchParams.search ?? "";
  const { contacts } = await getContacts(search || undefined, page, 50);

  // Temperatura (etiqueta) e valor da oportunidade de cada lead, para o painel
  const panelContacts = contacts.map((c) => {
    const row = c as unknown as {
      id: string;
      name: string;
      phone: string | null;
      contact_tags?: { tag?: { name?: string } | null }[] | null;
      opportunities?: { value?: number | string | null }[] | null;
    };
    const temperature = temperatureFromTagNames(
      (row.contact_tags ?? []).map((link) => link?.tag?.name),
    );
    const value = (row.opportunities ?? []).reduce(
      (max, o) => Math.max(max, Number(o?.value) || 0),
      0,
    );
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      temperature,
      value: value > 0 ? value : null,
    };
  });
  const contacted = await getContactedContactIds(contacts.map((c) => c.id)).catch(() => []);
  const stats = await getProspectStats().catch(() => null);
  const recentSearches = await getRecentSearches().catch(() => []);
  const outreach = await getOutreachStatus().catch(() => null);
  const [noPhoneCount, neverContactedCount] = await Promise.all([
    countContactsByFilter({ kind: "noPhone" }).catch(() => 0),
    countContactsByFilter({ kind: "neverContacted" }).catch(() => 0),
  ]);

  let gmail = { connected: false, email: null as string | null, canSend: false };
  try {
    const { organizationId } = await requireProfile();
    gmail = await gmailStatus(organizationId);
  } catch {
    // sem sessão/erro na conexão: segue só com WhatsApp
  }
  // E-mail pode vir pela plataforma do Hermes (IMAP/SMTP), sem OAuth do Google
  const hermesMail = hermesEmailStatus();
  const email = {
    canSend: gmail.canSend || hermesMail.configured,
    address: gmail.email ?? hermesMail.address ?? null,
    via: gmail.canSend ? "gmail" : hermesMail.configured ? "hermes" : null,
  };

  return (
    <div className="space-y-4">
      <div>
        <Breadcrumbs />
        <h1 className="text-xl font-bold">Central de prospecção</h1>
        <p className="text-sm text-muted-foreground">
          Busque empresas (Apify ou AISA) ou dispare um contato manual — os leads caem aqui embaixo,
          salvos no CRM, e o agente faz a abordagem.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border bg-card px-3 py-2">
            <p className="text-lg font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">leads no banco</p>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2">
            <p className="text-lg font-bold">{stats.contacted}</p>
            <p className="text-xs text-muted-foreground">contatados</p>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2">
            <p className="text-lg font-bold text-emerald-600">{stats.replied}</p>
            <p className="text-xs text-muted-foreground">responderam</p>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2">
            <p className="text-lg font-bold text-amber-600">{stats.waiting}</p>
            <p className="text-xs text-muted-foreground">aguardando follow-up</p>
          </div>
        </div>
      )}

      {/* Linha 1: os dois cards principais, alinhados com a mesma altura */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <div className="[&>div]:h-full">
          <CompanySearchPanel recentSearches={recentSearches} />
        </div>
        <div className="[&>div]:h-full">
          <ManualProspectPanel />
        </div>
      </div>

      {/* Largura total: quem a IA está prospectando, em tempo real */}
      <LiveProspectingPanel />

      {outreach && <OutreachCyclePanel initial={outreach} />}

      <ProspectPanel
        contacts={panelContacts}
        page={page}
        search={search}
        contacted={contacted}
        gmail={{ canSend: email.canSend, email: email.address }}
        tools={
          <>
            <ImportLeadsPanel />
            <BulkCleanupPanel
              counts={{
                noPhone: noPhoneCount,
                neverContacted: neverContactedCount,
                all: stats?.total ?? 0,
              }}
            />
          </>
        }
      />
    </div>
  );
}
