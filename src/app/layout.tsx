import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConectaCRM",
  description: "CRM multicanal com agentes de IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
