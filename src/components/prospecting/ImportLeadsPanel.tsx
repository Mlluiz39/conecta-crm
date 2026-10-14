"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FileUp, FileSpreadsheet, X, CheckCircle2, AlertCircle } from "lucide-react";
import { importLeads, type ImportLeadsResult } from "@/lib/data/actions";

const EXAMPLE_29_COLUMNS = `Empresa\tNicho\tBairro\tCidade\tWebsite\tTelefone (Google Maps)\tWhatsApp (site)\tInstagram\tPerfil Google Maps\tNota Google\tAvaliações\tAnúncios ativos\tMeta Ads\tEvidência Meta\tGoogle Ads\tEvidência Google\tPerformance mobile\tProblemas identificados\tServiço recomendado\tPts anúncios\tPts site\tPts SEO\tPts conversão\tPts contato\tPts fit\tPontuação\tPrioridade\tFontes\tData da verificação
Clínica Bem Estar\tClínica de Estética\tAldeota\tFortaleza\thttps://clinicabemestar.com.br\t(85) 3222-1111\t85988887777\t@clinicabemestar\thttps://maps.google.com/?cid=12345\t4.8\t120\tSim\tSim\t3 anúncios ativos na biblioteca\tNão\tNenhum anúncio\t42 (Lento)\tSite lento no mobile, imagens sem alt\tOtimização Web + Tráfego Pago\t20\t15\t15\t10\t10\t10\t80\tAlta\tGoogle Maps, Meta Ads\t2026-10-13`;

const EXAMPLE_APIFY_JSON = `[
  {
    "title": "Clínica Estética Bella",
    "categoryName": "Clínica de estética",
    "totalScore": 4.9,
    "reviewsCount": 84,
    "phone": "+55 85 99123-4567",
    "website": "https://bellafortaleza.com.br",
    "neighborhood": "Meireles",
    "city": "Fortaleza",
    "url": "https://www.google.com/maps/place/?q=place_id:ChIJ123"
  }
]`;

const EXAMPLE_SIMPLE = `Nome; Telefone; E-mail; Empresa; Cidade
Carlos Lima; (11) 98888-7777; carlos@clinicasorriso.com; Clínica Sorriso; São Paulo
Ana Souza; 11955554444; ana@empresa.com.br; Empresa X; Campinas`;

export function ImportLeadsPanel() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportLeadsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function run() {
    setError(null);
    setResult(null);

    if (!selectedFile && !text.trim()) {
      setError("Cole os dados dos leads ou selecione um arquivo (CSV, Excel ou JSON).");
      return;
    }

    startTransition(async () => {
      try {
        let r: ImportLeadsResult;
        if (selectedFile) {
          const fd = new FormData();
          fd.append("file", selectedFile);
          if (text.trim()) fd.append("text", text);
          r = await importLeads(fd);
        } else {
          r = await importLeads(text);
        }
        setResult(r);
        if (r.imported > 0) {
          setText("");
          setSelectedFile(null);
        }
      } catch (e) {
        setError((e as Error).message.replace(/^Error:\s*/, ""));
      }
    });
  }

  async function onFileSelected(file: File) {
    setSelectedFile(file);
    setError(null);
    setResult(null);
    setOpen(true);

    const isBinary = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    if (!isBinary) {
      try {
        const content = await file.text();
        setText(content);
      } catch {
        // arquivo grande ou binário, usa upload direto
      }
    }
  }

  return (
    <div className="rounded-xl border bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm font-bold">
          <Upload size={15} className="text-primary" />
          Importar leads & prospectados
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? "fechar" : "CSV, Excel (.xlsx), JSON (Apify/AISA) ou 29 colunas"}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t p-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Formatos auto-identificados:</span>
            <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
              Planilha 29 colunas
            </span>
            <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
              Apify (Google Maps)
            </span>
            <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
              AISA (Apollo B2B)
            </span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium">Excel (.xlsx/.xls)</span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium">CSV / JSON</span>
          </div>

          {selectedFile && (
            <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-primary" />
                <span className="font-semibold text-foreground">{selectedFile.name}</span>
                <span className="text-muted-foreground">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                title="Remover arquivo"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={EXAMPLE_29_COLUMNS}
            className="w-full resize-y rounded-xl border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={run}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              <Upload size={15} />
              {pending ? "Processando importação..." : "Importar leads"}
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFileSelected(f);
              }}
            />

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-accent cursor-pointer"
            >
              <FileUp size={15} />
              Subir arquivo (Excel, CSV, JSON)
            </button>

            <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
              <span>Carregar exemplo:</span>
              <button
                type="button"
                onClick={() => {
                  setText(EXAMPLE_29_COLUMNS);
                  setSelectedFile(null);
                }}
                className="underline hover:text-foreground cursor-pointer"
              >
                29 colunas
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => {
                  setText(EXAMPLE_APIFY_JSON);
                  setSelectedFile(null);
                }}
                className="underline hover:text-foreground cursor-pointer"
              >
                Apify JSON
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => {
                  setText(EXAMPLE_SIMPLE);
                  setSelectedFile(null);
                }}
                className="underline hover:text-foreground cursor-pointer"
              >
                CSV Simples
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={16} />
                  {result.imported} lead(s) importado(s) com sucesso!
                </p>
                {result.detectedLabel && (
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Origem: {result.detectedLabel}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {result.duplicates} já existiam (pulados) · {result.invalid} linha(s) ignorada(s)
              </p>
              {result.errors.length > 0 && (
                <p className="mt-1 text-xs text-destructive">{result.errors.join(" · ")}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
