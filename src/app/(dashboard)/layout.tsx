import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { DialogProvider } from "@/components/ui/dialog-provider";
import { InstallBanner } from "@/components/pwa/install-app";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DialogProvider>
      {/* app-safe-x / app-safe-bottom: respeitam notch e barra de gestos quando
          o app roda instalado (viewport-fit=cover). No navegador comum são zero. */}
      <div className="app-safe-x min-h-screen bg-background">
        <Sidebar />
        <div className="lg:pl-64">
          <Header />
          <main className="app-safe-bottom mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
            <InstallBanner />
            {children}
          </main>
        </div>
      </div>
    </DialogProvider>
  );
}
