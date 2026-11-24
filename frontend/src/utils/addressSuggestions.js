// Address suggestions from the PSGC place list (src/data/psgcAddresses.json,
// built by scripts/build-psgc-addresses.mjs). Sariaya first, then the rest
// of Quezon, then CALABARZON, then the rest of the country.

const HOME_TOWN = 'Sariaya';
const HOME_PROVINCE = 'Quezon';
const HOME_REGION_PROVINCES = ['Batangas', 'Cavite', 'Laguna', 'Quezon', 'Rizal'];
export const MAX_SUGGESTIONS = 8;

let dataPromise = null;
let index = null;

// Lowercase, no accents (so "castanas" finds "Castañas"), and without the
// words people may or may not type before a name.
export function normalize(text) {
  return (text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(brgy|bgy)\b\.?/g, 'barangay')
    .replace(/\bcity of\b/g, ' ')
    .replace(/\bpob\b\.?/g, 'poblacion')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // "Brgy. Castañas" is just Castañas, but "Barangay 1" is that barangay's name.
    .replace(/\bbarangay (?=[a-z])/g, '');
}

function barangayLabel(name) {
  return /^barangay\b/i.test(name) ? name : `Brgy. ${name}`;
}

// Turns the compact data file into one searchable list of suggestions.
export function buildIndex(data) {
  const entries = [];
  const tierOf = (place, province) => {
    if (place === HOME_TOWN && province === HOME_PROVINCE) return 0;
    if (province === HOME_PROVINCE) return 1;
    if (HOME_REGION_PROVINCES.includes(province)) return 2;
    return 3;
  };
  data.a.forEach((province) => {
    entries.push({ label: province, key: normalize(province), tier: tierOf(null, province) + 0.5, kind: 'province' });
  });
  data.p.forEach(([place, provinceIndex]) => {
    const province = data.a[provinceIndex];
    entries.push({ label: `${place}, ${province}`, key: normalize(place), tier: tierOf(place, province), kind: 'place' });
  });
  data.b.forEach(([barangay, placeIndex]) => {
    const [place, provinceIndex] = data.p[placeIndex];
    const province = data.a[provinceIndex];
    entries.push({
      label: `${barangayLabel(barangay)}, ${place}, ${province}`,
      key: normalize(barangay),
      tier: tierOf(place, province),
      kind: 'barangay',
    });
  });
  return entries;
}

export function loadAddressIndex() {
  if (index) return Promise.resolve(index);
  if (!dataPromise) {
    dataPromise = import('../data/psgcAddresses.json')
      .then((module) => {
        index = buildIndex(module.default);
        return index;
      })
      .catch((error) => {
        dataPromise = null; // let a later focus try again
        throw error;
      });
  }
  return dataPromise;
}

// 0: the name starts with the query; 1: a word in it does; 2: it contains it.
function matchRank(key, query) {
  if (key.startsWith(query)) return 0;
  if (key.includes(` ${query}`)) return 1;
  if (query.length >= 3 && key.includes(query)) return 2;
  return null;
}

export function searchPlaces(entries, rawQuery, limit = MAX_SUGGESTIONS) {
  const query = normalize(rawQuery);
  if (query.length < 2) return [];
  const found = [];
  for (const entry of entries) {
    const rank = matchRank(entry.key, query);
    if (rank !== null) found.push({ entry, rank });
  }
  // Sariaya's own matches first, then the closest name matches.
  const home = (entry) => (entry.tier < 1 ? 0 : 1);
  found.sort((a, b) => (
    home(a.entry) - home(b.entry)
    || a.rank - b.rank
    || a.entry.tier - b.entry.tier
    || a.entry.key.length - b.entry.key.length
    || a.entry.label.localeCompare(b.entry.label)
  ));
  return found.slice(0, limit).map(({ entry }) => entry);
}

/**
 * Suggestions for what the user is typing now: the part after the last
 * comma ("123 Rizal St., Casta" -> "Casta"). With no match there, the last
 * few words are tried ("123 Rizal St Castanas" -> "Castanas"). Each
 * suggestion carries the full text the field gets when it is picked, with
 * the house number and street the user already typed kept in front.
 */
export function suggestAddresses(entries, text, limit = MAX_SUGGESTIONS) {
  if (!entries || !text) return [];
  const comma = text.lastIndexOf(',');
  const before = comma >= 0 ? text.slice(0, comma + 1) : '';
  const segment = text.slice(comma + 1);
  const attempts = [{ keep: before, query: segment }];
  const words = segment.trim().split(/\s+/);
  for (let n = Math.min(3, words.length - 1); n >= 1; n -= 1) {
    const query = words.slice(-n).join(' ');
    if (normalize(query).length >= 3) {
      attempts.push({ keep: `${before}${before ? ' ' : ''}${words.slice(0, -n).join(' ')},`, query });
    }
  }
  for (const { keep, query } of attempts) {
    const results = searchPlaces(entries, query, limit);
    if (results.length) {
      const lead = keep.trim();
      return results.map((entry) => ({ ...entry, value: lead ? `${lead} ${entry.label}` : entry.label }));
    }
  }
  return [];
}
