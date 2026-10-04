"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { createContact } from "@/lib/data/actions";

export function NewContactButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        <Plus size={16} /> Novo Contato
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Novo Contato</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <form
              action={async (fd) => {
                await createContact(fd);
                setOpen(false);
              }}
              className="space-y-3"
            >
              <Field name="name" label="Nome completo" required />
              <div className="grid grid-cols-2 gap-3">
                <Field name="phone" label="Telefone" placeholder="(11) 99999-9999" />
                <Field name="email" label="E-mail" type="email" />
              </div>
              <Field name="company" label="Empresa" />
              <div className="grid grid-cols-2 gap-3">
                <Field name="city" label="Cidade" />
                <Field name="state" label="UF" />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  name,
  label,
  required,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
