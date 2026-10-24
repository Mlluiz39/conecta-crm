/**
 * Corpo enviado ao ator do Apify (Google Maps).
 *
 * Módulo puro de propósito: o `apify.ts` é `server-only` e cada execução do ator
 * custa crédito, então o formato do payload é testado aqui em vez de na rede.
 */

export type ApifyInputParams = {
  query: string;
  /** Quantas empresas varrer (antes do filtro de site/sistema). */
  varredura: number;
  /** Busca por raio a partir de um ponto. */
  geo: { lat: number; lng: number; raioKm: number } | null;
};

/** Monta o corpo enviado ao ator. */
export function buildApifyInput(input: {
  query: string;
  varredura: number;
  geo: { lat: number; lng: number; raioKm: number } | null;
}) {
  return {
    searchStringsArray: [input.query],
    maxCrawledPlacesPerSearch: input.varredura,
    language: "pt-BR",
    skipClosedPlaces: true,
    // Coordenada vai como GeoJSON, na ordem [longitude, latitude] que o ator exige.
    ...(input.geo
      ? {
          customGeolocation: {
            type: "Point",
            coordinates: [input.geo.lng, input.geo.lat],
            radiusKm: input.geo.raioKm,
          },
        }
      : {}),
    // 0 = não traz textos de avaliação (mais barato/rápido).
    // APIFY_MAX_REVIEWS=5 traz os comentários, ótimos para personalizar a abordagem.
    maxReviews: Number(process.env.APIFY_MAX_REVIEWS ?? 0) || 0,
    maxImages: 0,
  };
}
