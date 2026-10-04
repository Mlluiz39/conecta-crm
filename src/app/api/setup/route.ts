import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    mensagem: "O ConectaCRM está configurado e pronto para uso!",
  });
}
