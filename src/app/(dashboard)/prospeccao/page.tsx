import { getContacts, getContactedContactIds, getProspectStats } from "@/lib/data/queries";
import { requireProfile } from "@/lib/auth/session";
import { gmailStatus } from "@/services/email/gmail";
import { ProspectPanel } from "@/components/prospecting/ProspectPanel";
import { ImportLeadsPanel } from "@/components/prospecting/ImportLeadsPanel";

export const revalidate = 10;

export default async function ProspeccaoPage({
  searchParams,
}: {
  searchParams: { search?: string; page?: string };
}) {
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const search = searchParams.search ?? "";
  const { contacts } = await getContacts(search || undefined, page, 50);
  const contacted = await getContactedContactIds(contacts.map((c) => c.id)).catch(() => []);
  const stats = await getProspectStats().catch(() => null);

  let gmail = { connected: false, email: null as string | null, canSend: false };
  try {
    const { organizationId } = await requireProfile();
    gmail = await gmailStatus(organizationId);
  } catch {
    // sem sessão/erro na conexão: segue só com WhatsApp
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Prospecção</h1>
        <p className="text-sm text-muted-foreground">
          Importe leads, deixe o agente escrever a primeira abordagem e envie por WhatsApp ou
          e-mail. Respostas caem em Conversas e o agente de IA assume automaticamente.
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

      <ImportLeadsPanel />

      <ProspectPanel
        contacts={contacts}
        page={page}
        search={search}
        contacted={contacted}
        gmail={{ canSend: gmail.canSend, email: gmail.email }}
      />
    </div>
  );
}
