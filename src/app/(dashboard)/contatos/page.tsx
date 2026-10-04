import Link from "next/link";
import { getContacts } from "@/lib/data/queries";
import { PageHeader, Card, EmptyState, Badge } from "@/components/ui/primitives";
import { NewContactButton } from "@/components/contacts/NewContactButton";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContatosPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const contacts = await getContacts(searchParams.q);

  return (
    <div>
      <PageHeader
        title="Contatos"
        subtitle={`${contacts.length} contatos na base`}
        action={<NewContactButton />}
      />

      <form className="mb-4">
        <input
          name="q"
          defaultValue={searchParams.q}
          placeholder="Buscar por nome, e-mail, telefone ou empresa..."
          className="w-full rounded-xl border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-md"
        />
      </form>

      {contacts.length === 0 ? (
        <EmptyState label="Nenhum contato encontrado." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Contato</th>
                  <th className="px-4 py-3 font-semibold">Empresa</th>
                  <th className="px-4 py-3 font-semibold">Local</th>
                  <th className="px-4 py-3 font-semibold">Última interação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/contatos/${c.id}`} className="font-semibold hover:text-primary">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{c.phone ?? "—"}</div>
                      <div className="text-xs">{c.email ?? ""}</div>
                    </td>
                    <td className="px-4 py-3">{c.company ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.city ? `${c.city}${c.state ? `, ${c.state}` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.last_interaction_at ? (
                        formatDateTime(c.last_interaction_at)
                      ) : (
                        <Badge className="bg-muted text-muted-foreground">Novo</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
