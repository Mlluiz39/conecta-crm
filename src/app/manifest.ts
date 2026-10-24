import type { MetadataRoute } from "next";

/**
 * Manifest do PWA — o que faz o CRM instalar como app na tela inicial.
 *
 * `start_url` aponta para /dashboard (o app é usado logado) e `display: standalone`
 * remove a barra do navegador quando aberto pelo ícone. Os ícones "maskable" são
 * a mesma arte com folga extra, porque o Android recorta em círculo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ConectaCRM — prospecção e atendimento",
    short_name: "ConectaCRM",
    description:
      "CRM multicanal com agentes de IA: prospecte empresas, converse no WhatsApp e acompanhe o funil.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#f7f8fa",
    theme_color: "#5b4be6",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Atalhos do ícone (toque longo no app instalado)
    shortcuts: [
      {
        name: "Prospectar empresas",
        short_name: "Prospecção",
        url: "/prospeccao",
        description: "Buscar empresas e disparar a abordagem",
      },
      {
        name: "Conversas",
        short_name: "Conversas",
        url: "/conversas",
        description: "Falar com os leads",
      },
    ],
  };
}
