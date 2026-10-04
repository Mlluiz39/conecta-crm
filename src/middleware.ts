import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Tudo exceto estáticos, webhooks, rotas de IA e arquivos com extensão.
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/ai|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
