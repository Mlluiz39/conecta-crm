import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa/install-app";

export const metadata: Metadata = {
  title: "ConectaCRM",
  description: "CRM multicanal com agentes de IA",
  applicationName: "ConectaCRM",
  // iOS: abre em tela cheia quando instalado por "Adicionar à Tela de Início".
  // (O ícone vem de src/app/apple-icon.png e o favicon de src/app/icon.png —
  // convenção de arquivo do App Router, sem precisar declarar aqui.)
  appleWebApp: {
    capable: true,
    title: "ConectaCRM",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sem travar o zoom: quem precisa ampliar tem o direito (e o iOS só respeita
  // o zoom se maximumScale permitir).
  maximumScale: 5,
  userScalable: true,
  // Respeita o notch e a barra de gestos do iPhone.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#5b4be6" },
    { media: "(prefers-color-scheme: dark)", color: "#181b23" },
  ],
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
      <body suppressHydrationWarning>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
