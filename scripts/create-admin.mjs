import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

// Lê .env.local ou .env sem depender de pacotes externos
function loadEnv() {
  const envFile = fs.existsSync(".env.local") ? ".env.local" : ".env";
  const content = fs.readFileSync(envFile, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Erro: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontrados");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function gerarSenha() {
  const { randomBytes } = require("node:crypto");
  return randomBytes(18).toString("base64url");
}

const EMAIL = process.env.ADMIN_EMAIL || "admin@conectacrm.com.br";
// NUNCA deixe senha fixa aqui: o repositório pode ser público.
// Use ADMIN_PASSWORD=... ou o script gera uma senha forte e mostra uma vez.
const PASSWORD = process.env.ADMIN_PASSWORD || gerarSenha();
const ORG_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  console.log(`\nCriando/redefinindo usuário admin (${EMAIL}) via Supabase Auth API...`);

  // 1. Verifica se usuário já existe
  const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error("Erro ao listar usuários:", listErr.message);
    process.exit(1);
  }

  let user = usersData.users.find((u) => u.email === EMAIL);

  if (user) {
    console.log(`Usuário já existe (ID: ${user.id}). Atualizando senha...`);
    const { data: updated, error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Administrador" },
    });
    if (updateErr) {
      console.error("Erro ao atualizar senha:", updateErr.message);
      process.exit(1);
    }
    user = updated.user;
  } else {
    console.log("Criando usuário no Supabase Auth...");
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Administrador" },
    });
    if (createErr) {
      console.error("Erro ao criar usuário:", createErr.message);
      process.exit(1);
    }
    user = created.user;
  }

  console.log(`Usuário autenticado com sucesso! ID: ${user.id}`);

  // 2. Garante organização
  const { error: orgErr } = await supabase.from("organizations").upsert({
    id: ORG_ID,
    name: "Minha Empresa",
    business_type: "agencia",
  });
  if (orgErr) console.warn("Aviso organização:", orgErr.message);

  // 3. Vincula como admin em organization_members
  const { error: memberErr } = await supabase.from("organization_members").upsert(
    {
      organization_id: ORG_ID,
      user_id: user.id,
      role: "admin",
      full_name: "Administrador",
      is_active: true,
    },
    { onConflict: "organization_id,user_id" },
  );
  if (memberErr) console.warn("Aviso organization_members:", memberErr.message);

  // 4. Aplica perfil de negócio (etapas, tags, agentes)
  const { error: presetErr } = await supabase.rpc("apply_business_profile", { p_org: ORG_ID });
  if (presetErr) console.warn("Aviso apply_business_profile:", presetErr.message);

  console.log("\n=========================================");
  console.log(" USUÁRIO ADMIN CRIADO E CONFIRMADO!");
  console.log(` E-mail: ${EMAIL}`);
  console.log(` Senha:  ${PASSWORD}`);
  console.log("=========================================\n");
}

main();
