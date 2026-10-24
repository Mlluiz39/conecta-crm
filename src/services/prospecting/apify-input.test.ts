import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApifyInput } from "./apify-input.ts";

test("sem coordenada usa a busca por texto", () => {
  const input = buildApifyInput({ query: "pizzaria Vila Velha ES", varredura: 60, geo: null });
  assert.deepEqual(input.searchStringsArray, ["pizzaria Vila Velha ES"]);
  assert.equal(input.maxCrawledPlacesPerSearch, 60);
  assert.equal("customGeolocation" in input, false);
});

test("com coordenada manda GeoJSON na ordem longitude, latitude", () => {
  const input = buildApifyInput({
    query: "pizzaria",
    varredura: 60,
    geo: { lat: -20.3297, lng: -40.2925, raioKm: 5 },
  });
  assert.deepEqual(input.customGeolocation, {
    type: "Point",
    coordinates: [-40.2925, -20.3297],
    radiusKm: 5,
  });
  // A área passa a ser o raio: nada de cidade misturada na busca
  assert.deepEqual(input.searchStringsArray, ["pizzaria"]);
});

test("não liga a extração de avaliações por padrão", () => {
  const input = buildApifyInput({ query: "adega", varredura: 20, geo: null });
  assert.equal(input.maxReviews, 0);
  assert.equal(input.maxImages, 0);
  assert.equal(input.language, "pt-BR");
  assert.equal(input.skipClosedPlaces, true);
});
