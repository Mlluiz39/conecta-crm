import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConectaCRM",
  description: "CRM multicanal com agentes de IA",
};

// Aplica o tema antes do primeiro paint (evita flash claro/escuro).
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("crm-theme");var d=s?s==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
