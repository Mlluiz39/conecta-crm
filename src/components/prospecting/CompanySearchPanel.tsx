"use client";

import { useState, useTransition } from "react";
import { Building2, Search, RotateCcw, Phone, Globe, Star, CheckCircle2, Trash2, MapPin, Clock } from "lucide-react";
import { deleteContactsByFilter } from "@/lib/data/actions";
import { useConfirm, useNotify } from "@/components/ui/dialog-provider";
import type { RecentSearch } from "@/lib/data/queries";

type Lead = {
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  mapsUrl: string | null;
  neighborhood: string | null;
  street: string | null;
  postalCode: string | null;
  reviewsCount: number | null;
  price: string | null;
  unclaimed: boolean;
  permanentlyClosed: boolean;
  temporarilyClosed: boolean;
  openingHours: { day: string; hours: string }[];
  description: string | null;
  categories: string[];
  reviewTags: string[];
  imageUrl: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  raw: Record<string, unknown>;
  city: string | null;
  state: string | null;
  category: string | null;
  rating: number | null;
  source: string;
  saved: boolean;
};

type SearchResponse = {
  provider: string;
  found: number;
  saved: number;
  duplicates: number;
  leads: Lead[];
  error?: string;
};

type Provider = "apify" | "aisa";

const PROVIDER_INFO: Record<Provider, { label: string; hint: string }> = {
  apify: {
    label: "Apify",
    hint: "Google Maps — traz telefone, site, endereço e nota. Leva 1–3 min.",
  },
  aisa: {
    label: "AISA",
    hint: "Apollo — empresas por palavra-chave/região. Segundos, bom para e-mail e LinkedIn.",
  },
};

/**
 * "Buscar empresas": escolhe o método (Apify/AISA), busca, salva no CRM e lista
 * o resultado abaixo. O histórico permite repetir uma busca com um clique.
 */
export function CompanySearchPanel({ recentSearches }: { recentSearches: RecentSearch[] }) {
  const [provider, setProvider] = useState<Provider>("apify");
  const [nicho, setNicho] = useState("");
  const [local, setLocal] = useState("");
  const [max, setMax] = useState(20);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmDialog = useConfirm();
  const notify = useNotify();

  function search(overrides?: Partial<{ provider: Provider; nicho: string; local: string; max: number }>) {
    const params = {
      provider: overrides?.provider ?? provider,
      nicho: overrides?.nicho ?? nicho,
      local: overrides?.local ?? local,
      max: overrides?.max ?? max,
    };
    setError(null);
    setResult(null);

    if (!params.nicho.trim() && !params.local.trim()) {
      setError("Informe o nicho e o local (ex.: clínica odontológica em Vila Velha ES)");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/prospecting/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(params),
        });
        const json = (await res.json()) as SearchResponse;
        if (json.error) {
          setError(json.error);
          return;
        }
        setResult(json);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function rerun(previous: RecentSearch) {
    const prov: Provider = previous.provider === "aisa" ? "aisa" : "apify";
    setProvider(prov);
    setNicho(previous.nicho);
    setLocal(previous.local);
    search({ provider: prov, nicho: previous.nicho, local: previous.local });
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-primary/30 bg-card p-4">
      <div className="flex items-start gap-2">
        <Building2 size={17} className="mt-0.5 text-primary" />
        <div>
          <h2 className="text-sm font-bold">1 · Buscar empresas</h2>
          <p className="text-xs text-muted-foreground">
            Escolha o método, busque e os leads aparecem abaixo <strong>já salvos no CRM</strong>.
          </p>
        </div>
      </div>

      {/* Método */}
      <div className="inline-flex overflow-hidden rounded-xl border">
        {(["apify", "aisa"] as Provider[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setProvider(p)}
            className={`px-4 py-2 text-xs font-bold transition-colors ${
              provider === p ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            {PROVIDER_INFO[p].label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{PROVIDER_INFO[provider].hint}</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <input
          value={nicho}
          onChange={(e) => setNicho(e.target.value)}
          placeholder="Nicho: clínica odontológica"
          className="rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:col-span-5"
        />
        <input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder="Local: Vila Velha ES"
          className="rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:col-span-4"
        />
        <input
          type="number"
          min={1}
          max={100}
          value={max}
          onChange={(e) => setMax(Number(e.target.value) || 20)}
          title="Quantos resultados buscar"
          className="rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:col-span-3"
        />
      </div>

      <button
        type="button"
        onClick={() => search()}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        <Search size={15} />
        {pending
          ? provider === "apify"
            ? "Buscando… (1–3 min)"
            : "Buscando…"
          : "Buscar empresas"}
      </button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-emerald-600">
            {result.found} encontrado(s) · <strong>{result.saved} salvo(s) no CRM</strong>
            {result.duplicates ? ` · ${result.duplicates} já existia(m)` : ""}
            {result.leads.some((l) => !l.website) ? (
              <>
                {" · "}
                <span className="text-amber-600">
                  {result.leads.filter((l) => !l.website).length} sem site (melhor prospecto)
                </span>
              </>
            ) : null}
          </p>

          <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {result.leads.map((lead, i) => (
              <div
                key={`${lead.name}-${i}`}
                className="rounded-xl border bg-background p-2.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-semibold">{lead.name}</span>
                      {lead.saved ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                          <CheckCircle2 size={10} /> salvo
                        </span>
                      ) : (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                          já existia
                        </span>
                      )}
                      {!lead.phone && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                          sem telefone
                        </span>
                      )}
                      {!lead.website && (
                        <span
                          className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-600"
                          title="Não tem site no Google Maps — é o perfil que mais precisa do seu serviço"
                        >
                          sem site
                        </span>
                      )}
                      {lead.unclaimed && (
                        <span
                          className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold text-violet-600"
                          title="O dono não reclamou o perfil no Google — costuma indicar descuido com a presença digital"
                        >
                          perfil não reclamado
                        </span>
                      )}
                      {lead.price && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {lead.price}
                        </span>
                      )}
                      {lead.temporarilyClosed && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                          fechado agora
                        </span>
                      )}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                      {lead.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={10} /> {lead.phone}
                        </span>
                      )}
                      {lead.website && (
                        <a
                          href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline"
                        >
                          <Globe size={10} /> site
                        </a>
                      )}
                      {lead.mapsUrl && (
                        <a
                          href={lead.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline"
                          title="Abrir no Google Maps"
                        >
                          <MapPin size={10} /> Maps
                        </a>
                      )}
                      {lead.rating !== null && (
                        <span
                          className="inline-flex items-center gap-1"
                          title={lead.reviewsCount ? `${lead.reviewsCount} avaliações no Google` : undefined}
                        >
                          <Star size={10} /> {lead.rating}
                          {lead.reviewsCount ? (
                            <span className="text-[10px]">({lead.reviewsCount.toLocaleString("pt-BR")})</span>
                          ) : null}
                        </span>
                      )}
                      {(lead.neighborhood || lead.street) && (
                        <span
                          className="inline-flex items-center gap-1"
                          title={[lead.street, lead.neighborhood, lead.postalCode].filter(Boolean).join(" · ")}
                        >
                          <MapPin size={10} />
                          {[lead.neighborhood, lead.city].filter(Boolean).join(" / ") || lead.street}
                        </span>
                      )}
                      {lead.openingHours.length > 0 && (
                        <span
                          className="inline-flex items-center gap-1 cursor-help"
                          title={lead.openingHours.map((h) => `${h.day}: ${h.hours}`).join("\n")}
                        >
                          <Clock size={10} /> horários
                        </span>
                      )}
                      {lead.reviewTags.length > 0 && (
                        <span className="cursor-help" title={`O que os clientes citam: ${lead.reviewTags.join(", ")}`}>
                          {lead.reviewTags.slice(0, 3).join(" · ")}
                        </span>
                      )}
                      {(lead.city || lead.state) && (
                        <span>{[lead.city, lead.state].filter(Boolean).join(" / ")}</span>
                      )}
                      {lead.category && <span>{lead.category}</span>}
                    </span>
                    {lead.description && (
                      <span className="mt-1 line-clamp-2 text-[11px] italic text-muted-foreground">
                        “{lead.description}”
                      </span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentSearches.length > 0 && (
        <div className="space-y-1.5 border-t pt-3">
          <p className="text-xs font-bold text-muted-foreground">Buscas recentes</p>
          {recentSearches.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                <strong className="uppercase">{s.provider}</strong> · {s.nicho || "—"} ·{" "}
                {s.local || "—"} · {s.leads} lead(s), {s.withPhone} com telefone
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => rerun(s)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-semibold hover:bg-accent disabled:opacity-50"
                >
                  <RotateCcw size={11} /> buscar de novo
                </button>
                <button
                  type="button"
                  title="Apagar os leads desta busca"
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: `Apagar ${s.leads} lead(s) desta busca?`,
                      description: `${s.nicho || "—"} · ${s.local || "—"}\nConversas e mensagens desses leads vão junto. Não dá para desfazer.`,
                      confirmLabel: "Apagar",
                      tone: "danger",
                    });
                    if (!ok) return;
                    try {
                      const r = await deleteContactsByFilter({ kind: "search", at: s.at });
                      notify(`${r.deleted} lead(s) apagado(s)`);
                      window.location.reload();
                    } catch (e) {
                      notify((e as Error).message.replace(/^Error:\s*/, ""), "error");
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-2 py-1 font-semibold text-destructive hover:bg-destructive/10"
                >
                  <Trash2 size={11} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
