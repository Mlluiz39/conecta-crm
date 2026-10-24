/**
 * Classificação de presença digital a partir do campo `website` do Google Maps.
 *
 * A prospecção da MLLuiz só faz sentido em quem ainda não tem site nem sistema.
 * O Google Maps, porém, preenche esse campo com qualquer link: Instagram,
 * Facebook, linktree, perfil do Doctoralia, loja do Wix, formulário do Google…
 * Nenhum desses resolve o problema do cliente, então não contam como site.
 *
 * Modo estrito (`filterStrongProspects`): mantém apenas quem não tem site
 * próprio E não tem sistema. Rede social e link solto continuam valendo.
 */

/** Como o link do Maps se comporta na prática. */
export type PresenceKind =
  /** Nenhum link no perfil. */
  | "nenhum"
  /** Rede social ou agregador de links: não é site. */
  | "social"
  /** Formulário, documento, chat: link solto, também não é site. */
  | "neutro"
  /** Plataforma que já entrega site ou sistema (agenda, pedido, loja, construtor). */
  | "plataforma"
  /** Domínio próprio do negócio. */
  | "site_proprio";

export type WebsiteClassification = {
  kind: PresenceKind;
  /** Domínio normalizado (sem www), quando houver. */
  host: string | null;
  /** Nome curto para a tela: "Instagram", "Doctoralia", "site próprio"… */
  label: string;
  /** O negócio já tem site (mesmo que de construtor). */
  hasOwnSite: boolean;
  /** O negócio já usa algum sistema de agenda/pedido/gestão. */
  hasSystem: boolean;
};

type Brand = {
  host: string;
  label: string;
};

/** Rede social ou agregador de links: não é site, o lead continua valendo. */
const SOCIAL: Brand[] = [
  { host: "instagram.com", label: "Instagram" },
  { host: "facebook.com", label: "Facebook" },
  { host: "fb.com", label: "Facebook" },
  { host: "fb.me", label: "Facebook" },
  { host: "tiktok.com", label: "TikTok" },
  { host: "youtube.com", label: "YouTube" },
  { host: "youtu.be", label: "YouTube" },
  { host: "twitter.com", label: "Twitter" },
  { host: "x.com", label: "X" },
  { host: "threads.net", label: "Threads" },
  { host: "pinterest.com", label: "Pinterest" },
  { host: "linkedin.com", label: "LinkedIn" },
  { host: "wa.me", label: "WhatsApp" },
  { host: "api.whatsapp.com", label: "WhatsApp" },
  { host: "chat.whatsapp.com", label: "WhatsApp" },
  { host: "whatsapp.com", label: "WhatsApp" },
  { host: "t.me", label: "Telegram" },
  { host: "linktr.ee", label: "Linktree" },
  { host: "linktree.com", label: "Linktree" },
  { host: "bio.link", label: "Bio.link" },
  { host: "beacons.ai", label: "Beacons" },
  { host: "taplink.cc", label: "Taplink" },
  { host: "linkr.bio", label: "Linkr.bio" },
  { host: "msha.ke", label: "Milkshake" },
  { host: "snipfeed.co", label: "Snipfeed" },
];

/** Formulário/documento/mapa: link solto, não é site nem sistema. */
const NEUTRO: Brand[] = [
  { host: "forms.gle", label: "Google Forms" },
  { host: "docs.google.com", label: "Google Docs" },
  { host: "drive.google.com", label: "Google Drive" },
  { host: "maps.app.goo.gl", label: "Google Maps" },
  { host: "goo.gl", label: "Google Maps" },
  { host: "spotify.com", label: "Spotify" },
];

/**
 * Plataformas que já entregam site, agenda, pedido, loja ou gestão.
 * `hasOwnSite` = construtor de site; `hasSystem` = sistema operacional do negócio.
 */
const PLATAFORMAS: (Brand & { hasOwnSite?: boolean; hasSystem?: boolean })[] = [
  // Saúde — agenda online e prontuário
  { host: "doctoralia.com.br", label: "Doctoralia", hasSystem: true },
  { host: "doctoralia.com", label: "Doctoralia", hasSystem: true },
  { host: "doctoranytime.com.br", label: "Doctoranytime", hasSystem: true },
  { host: "doctoranytime.com", label: "Doctoranytime", hasSystem: true },
  { host: "boaconsulta.com", label: "BoaConsulta", hasSystem: true },
  { host: "iclinic.com.br", label: "iClinic", hasSystem: true },
  { host: "feegow.com.br", label: "Feegow", hasSystem: true },
  { host: "clinicorp.com", label: "Clinicorp", hasSystem: true },
  { host: "ninsaude.com", label: "Ninsaúde", hasSystem: true },
  { host: "amplimed.com.br", label: "Amplimed", hasSystem: true },
  // Beleza e bem-estar — agendamento
  { host: "booksy.com", label: "Booksy", hasSystem: true },
  { host: "trinks.com", label: "Trinks", hasSystem: true },
  { host: "agendei.com.br", label: "Agendei", hasSystem: true },
  { host: "resv.com.br", label: "Resv", hasSystem: true },
  { host: "belasy.com.br", label: "Belasy", hasSystem: true },
  { host: "salaovip.com.br", label: "Salão VIP", hasSystem: true },
  { host: "withcoach.com.br", label: "Withcoach", hasSystem: true },
  // Alimentação — cardápio, pedido e delivery
  { host: "goomer.app", label: "Goomer", hasSystem: true },
  { host: "goomer.com.br", label: "Goomer", hasSystem: true },
  { host: "anota.ai", label: "Anota AI", hasSystem: true },
  { host: "cardapioweb.com", label: "Cardápio Web", hasSystem: true },
  { host: "menudino.com", label: "MenuDino", hasSystem: true },
  { host: "aiqfome.com", label: "AiqaFome", hasSystem: true },
  { host: "deliverymuch.com.br", label: "Delivery Much", hasSystem: true },
  { host: "ifood.com.br", label: "iFood", hasSystem: true },
  { host: "rappi.com.br", label: "Rappi", hasSystem: true },
  // Construtor de site / loja virtual / hospedagem pronta
  { host: "wix.com", label: "Wix", hasOwnSite: true },
  { host: "wixsite.com", label: "Wix", hasOwnSite: true },
  { host: "business.site", label: "Google Meu Negócio", hasOwnSite: true },
  { host: "sites.google.com", label: "Google Sites", hasOwnSite: true },
  { host: "wordpress.com", label: "WordPress.com", hasOwnSite: true },
  { host: "blogspot.com", label: "Blogger", hasOwnSite: true },
  { host: "squarespace.com", label: "Squarespace", hasOwnSite: true },
  { host: "weebly.com", label: "Weebly", hasOwnSite: true },
  { host: "jimdo.com", label: "Jimdo", hasOwnSite: true },
  { host: "webnode.com.br", label: "Webnode", hasOwnSite: true },
  { host: "nuvemshop.com.br", label: "Nuvemshop", hasOwnSite: true },
  { host: "lojaintegrada.com.br", label: "Loja Integrada", hasOwnSite: true },
  { host: "myshopify.com", label: "Shopify", hasOwnSite: true },
  { host: "agendor.com.br", label: "Agendor", hasSystem: true },
  { host: "rdstation.com", label: "RD Station", hasSystem: true },
  { host: "calendly.com", label: "Calendly", hasSystem: true },
];

/** O host é o domínio da marca ou um subdomínio dela. */
function matches(host: string, marca: string): boolean {
  return host === marca || host.endsWith(`.${marca}`);
}

/**
 * Domínio normalizado (sem www), aceitando URL sem protocolo.
 *
 * Duplica de propósito o `domainOf` de company-search.ts: aquele módulo importa
 * `@/lib/data/lead-parser`, e o `node --test` do projeto não resolve o alias `@/`,
 * o que impediria este arquivo de ser testado direto.
 */
function hostOf(url: string | null | undefined): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return null;
  }
}

function findBrand<T extends Brand>(host: string, marcas: T[]): T | undefined {
  return marcas.find((m) => matches(host, m.host));
}

/**
 * Classifica o `website` de uma empresa do Maps.
 * @param website - campo cru do provedor (pode vir sem protocolo).
 */
export function classifyWebsite(website: string | null | undefined): WebsiteClassification {
  const host = hostOf(website);
  if (!host) {
    return { kind: "nenhum", host: null, label: "sem site", hasOwnSite: false, hasSystem: false };
  }

  // Rede social antes de plataforma: evita que um link já classificado como
  // social caia no balde de "sistema" por engano.
  const social = findBrand(host, SOCIAL);
  if (social) {
    return { kind: "social", host, label: social.label, hasOwnSite: false, hasSystem: false };
  }

  const neutro = findBrand(host, NEUTRO);
  if (neutro) {
    return { kind: "neutro", host, label: neutro.label, hasOwnSite: false, hasSystem: false };
  }

  const plataforma = findBrand(host, PLATAFORMAS);
  if (plataforma) {
    return {
      kind: "plataforma",
      host,
      label: plataforma.label,
      hasOwnSite: plataforma.hasOwnSite === true,
      hasSystem: plataforma.hasSystem === true,
    };
  }

  return { kind: "site_proprio", host, label: "site próprio", hasOwnSite: true, hasSystem: false };
}

/** Só entra na prospecção estrita quem não tem site próprio nem sistema. */
export function isStrongProspect(website: string | null | undefined): boolean {
  const { hasOwnSite, hasSystem } = classifyWebsite(website);
  return !hasOwnSite && !hasSystem;
}

export type ProspectFilterResult<T> = {
  kept: T[];
  discarded: number;
  counts: {
    /** Saiu por ter domínio próprio (ou site de construtor). */
    comSite: number;
    /** Saiu por já usar sistema/plataforma de agenda, pedido ou gestão. */
    comSistema: number;
  };
};

/**
 * Aplica o filtro estrito numa leva de leads.
 * @param leads - leads já normalizados (precisam ter `website`).
 * @param limit - quantos manter no máximo (o pedido original do usuário).
 */
export function filterStrongProspects<T extends { website: string | null }>(
  leads: T[],
  limit?: number,
): ProspectFilterResult<T> {
  const kept: T[] = [];
  const counts = { comSite: 0, comSistema: 0 };

  for (const lead of leads) {
    const { hasOwnSite, hasSystem } = classifyWebsite(lead.website);
    if (hasOwnSite) {
      counts.comSite++;
      continue;
    }
    if (hasSystem) {
      counts.comSistema++;
      continue;
    }
    if (limit !== undefined && kept.length >= limit) continue;
    kept.push(lead);
  }

  return { kept, discarded: counts.comSite + counts.comSistema, counts };
}
