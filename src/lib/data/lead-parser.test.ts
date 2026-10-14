import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  normalizePhone,
  parseLeadLine,
  stripHeader,
  parseUniversalLeads,
  detectLeadSource,
} from "./lead-parser.ts";

test("normalizePhone adiciona o DDI 55 em números locais", () => {
  assert.equal(normalizePhone("(11) 97786-9073"), "5511977869073");
});

test("normalizePhone mantém número que já tem DDI", () => {
  assert.equal(normalizePhone("5511977869073"), "5511977869073");
});

test("normalizePhone recusa números fora do tamanho esperado", () => {
  assert.equal(normalizePhone("123"), null);
  assert.equal(normalizePhone("12345678901234567"), null);
});

test("lê o formato nome; telefone; email; empresa; cidade", () => {
  assert.deepEqual(
    parseLeadLine("Carlos Lima; (11) 98888-7777; carlos@clinica.com; Clínica Sorriso; São Paulo"),
    {
      name: "Carlos Lima",
      phone: "5511988887777",
      email: "carlos@clinica.com",
      company: "Clínica Sorriso",
      city: "São Paulo",
    },
  );
});

test("aceita CSV com vírgulas", () => {
  const lead = parseLeadLine("Ana Souza, 11955554444, ana@empresa.com.br, Empresa X");
  assert.equal(lead?.name, "Ana Souza");
  assert.equal(lead?.phone, "5511955554444");
  assert.equal(lead?.email, "ana@empresa.com.br");
  assert.equal(lead?.company, "Empresa X");
});

test("aceita tabulação (colado do Excel)", () => {
  const lead = parseLeadLine("João Pedro\t11944443333\tjoao@loja.com\tLoja do João\tCampinas");
  assert.equal(lead?.name, "João Pedro");
  assert.equal(lead?.phone, "5511944443333");
  assert.equal(lead?.city, "Campinas");
});

test("aceita lead só com e-mail", () => {
  assert.deepEqual(parseLeadLine("Maria Silva; maria@agencia.com"), {
    name: "Maria Silva",
    phone: null,
    email: "maria@agencia.com",
    company: null,
    city: null,
  });
});

test("reconhece telefone e e-mail em qualquer ordem", () => {
  const lead = parseLeadLine("contato@site.com; 11 91234-5678; Roberto Dias");
  assert.equal(lead?.name, "Roberto Dias");
  assert.equal(lead?.phone, "5511912345678");
  assert.equal(lead?.email, "contato@site.com");
});

test("ignora linha sem nome ou sem contato", () => {
  assert.equal(parseLeadLine("11999998888"), null);
  assert.equal(parseLeadLine("Empresa Fantasma"), null);
  assert.equal(parseLeadLine(""), null);
});

test("stripHeader remove cabeçalho de planilha", () => {
  assert.deepEqual(stripHeader(["Nome;Telefone;Email", "Ana;11999998888;a@b.com"]), [
    "Ana;11999998888;a@b.com",
  ]);
});

test("stripHeader mantém a primeira linha quando é um lead", () => {
  const lines = ["Ana Souza; 11999998888", "Bruno; 11888887777"];
  assert.deepEqual(stripHeader(lines), lines);
});

test("parseUniversalLeads: reconhece e extrai a Planilha de Prospecção (29 colunas)", () => {
  const csv29 = [
    "Empresa\tNicho\tBairro\tCidade\tWebsite\tTelefone (Google Maps)\tWhatsApp (site)\tInstagram\tPerfil Google Maps\tNota Google\tAvaliações\tAnúncios ativos\tMeta Ads\tEvidência Meta\tGoogle Ads\tEvidência Google\tPerformance mobile\tProblemas identificados\tServiço recomendado\tPts anúncios\tPts site\tPts SEO\tPts conversão\tPts contato\tPts fit\tPontuação\tPrioridade\tFontes\tData da verificação",
    "Clínica Renova\tEstética Avançada\tMeireles\tFortaleza\thttps://renovaestetica.com\t(85) 3456-7890\t85991112222\t@renovaestetica\thttps://maps.google.com/?cid=999\t4.9\t150\tSim\tSim\t4 anúncios na biblioteca\tNão\tNenhum\t38 (Lento)\tLCP > 4s, sem alt tags\tOtimização Web + Tráfego\t20\t15\t15\t10\t10\t10\t80\tAlta\tGoogle Maps, Meta\t2026-10-13",
  ].join("\n");

  const res = parseUniversalLeads({ text: csv29 });
  assert.equal(res.detectedSource, "prospect_sheet");
  assert.equal(res.leads.length, 1);

  const lead = res.leads[0];
  assert.equal(lead.name, "Clínica Renova");
  assert.equal(lead.phone, "5585991112222"); // priorizou whatsapp do site
  assert.equal(lead.instagram_handle, "renovaestetica");
  assert.equal(lead.custom_fields.empresa, "Clínica Renova");
  assert.equal(lead.custom_fields.nicho, "Estética Avançada");
  assert.equal(lead.custom_fields.bairro, "Meireles");
  assert.equal(lead.custom_fields.cidade, "Fortaleza");
  assert.equal(lead.custom_fields.site, "https://renovaestetica.com");
  assert.equal(lead.custom_fields.telefone_maps, "(85) 3456-7890");
  assert.equal(lead.custom_fields.whatsapp, "85991112222");
  assert.equal(lead.custom_fields.nota, 4.9);
  assert.equal(lead.custom_fields.avaliacoes, 150);
  assert.equal(lead.custom_fields.meta_ads, "Sim");
  assert.equal(lead.custom_fields.evidencia_meta, "4 anúncios na biblioteca");
  assert.equal(lead.custom_fields.performance_mobile, "38 (Lento)");
  assert.equal(lead.custom_fields.servico_recomendado, "Otimização Web + Tráfego");
  assert.equal(lead.custom_fields.pontuacao, 80);
  assert.equal(lead.custom_fields.prioridade, "Alta");
  assert.equal(lead.custom_fields.origem, "planilha_prospeccao");
});

test("parseUniversalLeads: reconhece e extrai JSON do Apify (Google Maps Scraper)", () => {
  const apifyJson = JSON.stringify([
    {
      title: "Dermato Care Fortaleza",
      categoryName: "Dermatologista",
      totalScore: 4.8,
      reviewsCount: 92,
      phone: "+55 85 98765-4321",
      website: "https://dermatocare.com.br",
      neighborhood: "Aldeota",
      city: "Fortaleza",
      url: "https://www.google.com/maps/place/?cid=12345",
      placeId: "ChIJ123456",
    },
  ]);

  const res = parseUniversalLeads({ text: apifyJson, fileName: "apify-export.json" });
  assert.equal(res.detectedSource, "apify");
  assert.equal(res.leads.length, 1);

  const lead = res.leads[0];
  assert.equal(lead.name, "Dermato Care Fortaleza");
  assert.equal(lead.phone, "5585987654321");
  assert.equal(lead.custom_fields.nicho, "Dermatologista");
  assert.equal(lead.custom_fields.nota, 4.8);
  assert.equal(lead.custom_fields.avaliacoes, 92);
  assert.equal(lead.custom_fields.cidade, "Fortaleza");
  assert.equal(lead.custom_fields.origem, "apify");
});

test("parseUniversalLeads: reconhece e extrai JSON do AISA (Apollo)", () => {
  const aisaJson = JSON.stringify({
    organizations: [
      {
        name: "Tech Solutions B2B",
        industry: "Information Technology",
        website_url: "https://techsolutions.com",
        city: "São Paulo",
        state: "SP",
        primary_phone: { sanitized_number: "+5511999990000" },
        linkedin_url: "https://linkedin.com/company/techsolutions",
      },
    ],
  });

  const res = parseUniversalLeads({ text: aisaJson, fileName: "aisa_results.json" });
  assert.equal(res.detectedSource, "aisa");
  assert.equal(res.leads.length, 1);

  const lead = res.leads[0];
  assert.equal(lead.name, "Tech Solutions B2B");
  assert.equal(lead.phone, "5511999990000");
  assert.equal(lead.custom_fields.nicho, "Information Technology");
  assert.equal(lead.custom_fields.site, "https://techsolutions.com");
  assert.equal(lead.custom_fields.linkedin, "https://linkedin.com/company/techsolutions");
  assert.equal(lead.custom_fields.origem, "aisa");
});

test("parseUniversalLeads: aceita arquivo Excel (.xlsx) binário", () => {
  const data = [
    {
      Empresa: "Clínica Excel Pro",
      Nicho: "Fisioterapia",
      Cidade: "Fortaleza",
      "WhatsApp (site)": "85988880000",
      "Nota Google": 5.0,
      Pontuação: 90,
      Prioridade: "Alta",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const res = parseUniversalLeads({ buffer, fileName: "prospeccao.xlsx" });
  assert.equal(res.detectedSource, "prospect_sheet");
  assert.equal(res.leads.length, 1);
  assert.equal(res.leads[0].name, "Clínica Excel Pro");
  assert.equal(res.leads[0].phone, "5585988880000");
  assert.equal(res.leads[0].custom_fields.pontuacao, 90);
});
