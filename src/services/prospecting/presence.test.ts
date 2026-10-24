import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyWebsite, filterStrongProspects, isStrongProspect } from "./presence.ts";

test("sem website é o melhor prospecto", () => {
  for (const vazio of [null, undefined, "", "   "]) {
    const c = classifyWebsite(vazio);
    assert.equal(c.kind, "nenhum", String(vazio));
    assert.equal(c.hasOwnSite, false);
    assert.equal(c.hasSystem, false);
    assert.equal(isStrongProspect(vazio), true);
  }
});

test("rede social não conta como site", () => {
  for (const url of [
    "https://www.instagram.com/pizzariadobairro",
    "instagram.com/pizzariadobairro",
    "https://www.facebook.com/pizzariadobairro",
    "https://wa.me/5527999999999",
    "https://linktr.ee/pizzariadobairro",
    "https://www.tiktok.com/@pizzariadobairro",
  ]) {
    const c = classifyWebsite(url);
    assert.equal(c.kind, "social", url);
    assert.equal(isStrongProspect(url), true, url);
  }
});

test("formulário e documento são link solto, não site", () => {
  for (const url of ["https://forms.gle/abc123", "https://docs.google.com/forms/d/xyz"]) {
    const c = classifyWebsite(url);
    assert.equal(c.kind, "neutro", url);
    assert.equal(isStrongProspect(url), true, url);
    assert.equal(c.hasOwnSite, false);
  }
});

test("plataforma de agendamento e pedido é sistema", () => {
  for (const url of [
    "https://www.doctoralia.com.br/dra-marina/dentista",
    "https://booksy.com/pt-br/123_barbearia",
    "https://www.trinks.com/salao-x",
    "https://goomer.app/loja/pizzaria",
    "https://anota.ai/pizzaria",
    "https://www.ifood.com.br/delivery/pizzaria",
    "https://calendly.com/pizzaria",
  ]) {
    const c = classifyWebsite(url);
    assert.equal(c.kind, "plataforma", url);
    assert.equal(c.hasSystem, true, url);
    assert.equal(isStrongProspect(url), false, url);
  }
});

test("construtor de site conta como site", () => {
  for (const url of [
    "https://pizzaria.wixsite.com/site",
    "https://pizzaria.business.site",
    "https://pizzaria.nuvemshop.com.br",
  ]) {
    const c = classifyWebsite(url);
    assert.equal(c.kind, "plataforma", url);
    assert.equal(c.hasOwnSite, true, url);
    assert.equal(isStrongProspect(url), false, url);
  }
});

test("domínio próprio é descartado", () => {
  for (const url of [
    "https://www.pizzariadobairro.com.br",
    "pizzariadobairro.com.br",
    "https://sistema.clinicax.com.br/login",
  ]) {
    const c = classifyWebsite(url);
    assert.equal(c.kind, "site_proprio", url);
    assert.equal(isStrongProspect(url), false, url);
  }
});

test("subdomínio de rede social é reconhecido", () => {
  assert.equal(classifyWebsite("https://m.facebook.com/loja").kind, "social");
  assert.equal(classifyWebsite("https://api.whatsapp.com/send?phone=55").kind, "social");
});

test("filtro estrito mantém só quem não tem site nem sistema, até o limite", () => {
  const leads = [
    { name: "sem site", website: null },
    { name: "instagram", website: "https://instagram.com/a" },
    { name: "site proprio", website: "https://a.com.br" },
    { name: "doctoralia", website: "https://doctoralia.com.br/a" },
    { name: "wix", website: "https://a.wixsite.com/x" },
    { name: "outra sem site", website: null },
  ];

  const r = filterStrongProspects(leads, 2);
  assert.deepEqual(r.kept.map((l) => l.name), ["sem site", "instagram"]);
  assert.equal(r.counts.comSite, 2); // site proprio + wix
  assert.equal(r.counts.comSistema, 1); // doctoralia
  assert.equal(r.discarded, 3);
});

test("filtro sem limite mantém todos os aprovados", () => {
  const leads = [
    { name: "a", website: null },
    { name: "b", website: "https://facebook.com/b" },
    { name: "c", website: "https://c.com.br" },
  ];
  const r = filterStrongProspects(leads);
  assert.equal(r.kept.length, 2);
  assert.equal(r.discarded, 1);
});
