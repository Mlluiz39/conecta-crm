import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Tudo exceto estáticos, webhooks, captação pública (auth por token),
    // rotas de IA, cron (auth próprio via CRON_SECRET) e arquivos com extensão.
    //
    // Do PWA, três caminhos ficam fora da sessão de propósito: o navegador
    // busca o manifest e o service worker sem cookie (e um 307 para /login no
    // lugar do sw.js faz o app deixar de ser instalável), e /offline precisa
    // abrir justamente quando não há rede para autenticar.
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/captacao|api/ai|api/cron|sw\\.js|manifest\\.webmanifest|offline|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|txt|xml)$).*)",
  ],
};
