import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { DialogProvider } from "@/components/ui/dialog-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DialogProvider>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <div className="lg:pl-64">
          <Header />
          <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </DialogProvider>
  );
}
