import { getConnections } from "@/lib/data/connections";
import { ConnectionsManager } from "@/components/connections/ConnectionsManager";

export const dynamic = "force-dynamic";

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
