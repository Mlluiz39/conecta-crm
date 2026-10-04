import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function GET(request: NextRequest) {
  const admin = createAdminClient();
  const searchParams = request.nextUrl.searchParams;

  // Permite passar ?email=...&senha=... na URL, ou usa o default
  const email = (searchParams.get("email") || "admin@conectacrm.com.br").trim().toLowerCase();
  const password = searchParams.get("senha") || searchParams.get("password") || "TROCAR-ESTA-SENHA";

  const logs: string[] = [];

  try {
    logs.push(`1. Buscando usuário com e-mail: ${email}`);
    const { data: usersData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) {
      return NextResponse.json({ error: "Erro ao listar usuários", details: listErr.message, logs }, { status: 500 });
    }

    let user = usersData.users.find((u) => u.email?.toLowerCase() === email);

    if (user) {
      logs.push(`2. Usuário encontrado (ID: ${user.id}). Forçando nova senha e confirmação de e-mail via GoTrue API...`);
      const { data: updateRes, error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
        password: password,
        email_confirm: true,
        user_metadata: { full_name: "Administrador" },
      });

      if (updateErr) {
        logs.push(`Erro no updateUserById: ${updateErr.message}`);
        return NextResponse.json({ error: "Falha ao atualizar senha", details: updateErr.message, logs }, { status: 500 });
      }
      user = updateRes.user;
      logs.push("Senha atualizada com sucesso pelo próprio GoTrue!");
    } else {
      logs.push("2. Usuário não existia. Criando via admin.createUser...");
      const { data: createRes, error: createErr } = await admin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { full_name: "Administrador" },
      });

      if (createErr) {
        logs.push(`Erro no createUser: ${createErr.message}`);
        return NextResponse.json({ error: "Falha ao criar usuário", details: createErr.message, logs }, { status: 500 });
      }
      user = createRes.user;
      logs.push(`Usuário criado com sucesso! ID: ${user.id}`);
    }

    // 3. Garante organização
    logs.push("3. Garantindo organização 'Minha Empresa'...");
    const { error: orgErr } = await admin.from("organizations").upsert({
      id: ORG_ID,
      name: "Minha Empresa",
      business_type: "agencia",
    });
    if (orgErr) logs.push(`Aviso org: ${orgErr.message}`);

    // 4. Vincula em organization_members
    logs.push("4. Vinculando usuário em organization_members como 'admin'...");
    const { error: memberErr } = await admin.from("organization_members").upsert(
      {
        organization_id: ORG_ID,
        user_id: user.id,
        role: "admin",
        full_name: "Administrador",
        is_active: true,
      },
      { onConflict: "organization_id,user_id" },
    );
    if (memberErr) logs.push(`Aviso member: ${memberErr.message}`);

    // 5. Teste real de login via client anon (o mesmo que a tela de login usa)
    logs.push(`5. Testando autenticação real com ${email} e senha fornecida...`);
    const anon = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const { data: loginData, error: loginErr } = await anon.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (loginErr) {
      logs.push(`❌ ERRO NO TESTE DE LOGIN: ${loginErr.message} (status: ${loginErr.status})`);
      return NextResponse.json({
        ok: false,
        error: "Supabase recusou as credenciais",
        motivo: loginErr.message,
        status: loginErr.status,
        user_id: user.id,
        email_confirmed_at: user.email_confirmed_at,
        logs,
      }, { status: 400 });
    }

    logs.push("✅ Login testado com sucesso absoluto! Token JWT recebido.");

    return NextResponse.json({
      ok: true,
      mensagem: "Pronto! Usuário e senha sincronizados com sucesso.",
      credenciais: {
        email: email,
        senha: password,
      },
      user_id: user.id,
      session_criada: !!loginData.session?.access_token,
      logs,
    });
  } catch (err) {
    logs.push(`Exceção: ${(err as Error).message}`);
    return NextResponse.json({ error: (err as Error).message, logs }, { status: 500 });
  }
}
