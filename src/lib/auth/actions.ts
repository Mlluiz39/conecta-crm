"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  console.log(`[login] Tentando login para: ${email}`);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("[login erro]", error.status, error.name, error.message);
    redirect(`/login?erro=${encodeURIComponent(error.message)}`);
  }

  console.log(`[login sucesso] Usuário ID: ${data.user?.id}`);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
