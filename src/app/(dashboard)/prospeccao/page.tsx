import { getContacts } from "@/lib/data/queries";
import { ProspectPanel } from "@/components/prospecting/ProspectPanel";

export const revalidate = 10;

export default async function ProspeccaoPage({
  searchParams,
}: {
  searchParams: { search?: string; page?: string };
}) {
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const search = searchParams.search ?? "";
  const contacts = await getContacts(search || undefined, page, 50);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Prospecção</h1>
        <p className="text-sm text-muted-foreground">
          Selecione contatos e envie a primeira mensagem. Respostas caem em Conversas e o
          agente de IA assume automaticamente.
        </p>
      </div>

      <ProspectPanel contacts={contacts} page={page} search={search} />
    </div>
  );
}
