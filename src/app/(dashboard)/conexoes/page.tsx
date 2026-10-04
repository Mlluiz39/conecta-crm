import { getConnections } from "@/lib/data/connections";
import dynamic from "next/dynamic";

const ConnectionsManager = dynamic(
  () => import("@/components/connections/ConnectionsManager").then((m) => ({ default: m.ConnectionsManager })),
  { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-2xl bg-muted" /> },
);

export const revalidate = 60;

export default async function ConexoesPage() {
  const { config, channels, appUrl } = await getConnections();

  return (
    <ConnectionsManager
      config={config}
      channels={channels}
      appUrl={appUrl}
    />
  );
}
