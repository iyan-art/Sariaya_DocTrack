// Builds src/data/psgcAddresses.json, the place list behind the address
// suggestions (src/components/documents/AddressAutocomplete.jsx), from the
// Philippine Standard Geographic Code (PSGC) published by the Philippine
// Statistics Authority, via the PSGC API mirror at https://psgc.gitlab.io/api.
//
// Run again after a PSGC update:   node scripts/build-psgc-addresses.mjs
//
// Contents: every province, every city/municipality in the country, and the
// barangays of Region IV-A CALABARZON (Sariaya's region). Barangays outside
// the region are left out to keep the file small; users type those by hand.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://psgc.gitlab.io/api';
const CALABARZON = '040000000';

// Cities outside any province in the PSGC, placed in the province or area
// people write in an address.
const AREA_FOR_CITY_WITHOUT_PROVINCE = {
  '130000000': 'Metro Manila', // all of NCR
  'City of Isabela': 'Basilan',
  'City of Cotabato': 'Maguindanao del Norte',
};

async function get(path) {
  const response = await fetch(`${API}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

// "City of Lucena" -> "Lucena City", the way addresses are usually written.
const cityName = (name) => (name === 'City of Manila' ? 'Manila' : name.replace(/^City of (.+)$/, '$1 City'));

const [provinces, places, barangays] = await Promise.all([
  get('provinces.json'),
  get('cities-municipalities.json'),
  get(`regions/${CALABARZON}/barangays.json`),
]);

const provinceName = Object.fromEntries(provinces.map((p) => [p.code, p.name]));
const areas = [...new Set([
  ...provinces.map((p) => p.name),
  ...Object.values(AREA_FOR_CITY_WITHOUT_PROVINCE),
])].sort();
const areaIndex = Object.fromEntries(areas.map((name, i) => [name, i]));

const placeIndex = {};
const placeRows = places.map((p, i) => {
  placeIndex[p.code] = i;
  const area = provinceName[p.provinceCode]
    || AREA_FOR_CITY_WITHOUT_PROVINCE[p.name]
    || AREA_FOR_CITY_WITHOUT_PROVINCE[p.regionCode];
  if (!area) throw new Error(`No province for ${p.name}`);
  return [cityName(p.name), areaIndex[area]];
});

const barangayRows = barangays.map((b) => {
  const place = placeIndex[b.municipalityCode || b.cityCode];
  if (place === undefined) throw new Error(`No city/municipality for barangay ${b.name}`);
  return [b.name, place];
});

const out = {
  source: 'Philippine Standard Geographic Code (PSA), via psgc.gitlab.io',
  // a: province or area names; p: [city/municipality, a index];
  // b: [barangay, p index]
  a: areas,
  p: placeRows,
  b: barangayRows,
};
const target = fileURLToPath(new URL('../src/data/psgcAddresses.json', import.meta.url));
writeFileSync(target, JSON.stringify(out));
console.log(`${areas.length} provinces/areas, ${placeRows.length} cities/municipalities, ${barangayRows.length} barangays -> ${target}`);
