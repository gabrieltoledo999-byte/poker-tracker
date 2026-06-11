import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";

type RawCity = {
  name?: string;
};

type RawState = {
  name?: string;
  state_code?: string;
  cities?: RawCity[];
};

type RawCountry = {
  name?: string;
  iso2?: string;
  states?: RawState[];
};

type RawLocalitiesFile = {
  countries?: RawCountry[];
};

export type LocalityCountry = {
  name: string;
  code: string;
};

export type LocalityState = {
  name: string;
  code: string;
};

type LocalityCache = {
  countries: LocalityCountry[];
  statesByCountryCode: Map<string, LocalityState[]>;
  citiesByCountryState: Map<string, string[]>;
};

let localitiesCache: LocalityCache | null = null;

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cityKey(countryCode: string, stateName: string): string {
  return `${countryCode.toUpperCase()}|${normalizeToken(stateName)}`;
}

function loadLocalitiesCache(): LocalityCache {
  if (localitiesCache) return localitiesCache;

  const filePath = path.join(process.cwd(), "data", "localidades_hierarquico.json.gz");
  const gzBuffer = readFileSync(filePath);
  const rawJson = gunzipSync(gzBuffer).toString("utf8");
  const parsed = JSON.parse(rawJson) as RawLocalitiesFile;

  const countries: LocalityCountry[] = [];
  const statesByCountryCode = new Map<string, LocalityState[]>();
  const citiesByCountryState = new Map<string, string[]>();

  for (const country of parsed.countries ?? []) {
    const name = String(country?.name ?? "").trim();
    const code = String(country?.iso2 ?? "").trim().toUpperCase();
    if (!name || code.length !== 2) continue;

    countries.push({ name, code });

    const states: LocalityState[] = [];
    for (const state of country.states ?? []) {
      const stateName = String(state?.name ?? "").trim();
      if (!stateName) continue;
      states.push({
        name: stateName,
        code: String(state?.state_code ?? "").trim().toUpperCase(),
      });

      const citySet = new Set<string>();
      for (const city of state.cities ?? []) {
        const cityName = String(city?.name ?? "").trim();
        if (!cityName) continue;
        citySet.add(cityName);
      }

      if (citySet.size > 0) {
        citiesByCountryState.set(
          cityKey(code, stateName),
          Array.from(citySet).sort((a, b) => a.localeCompare(b, "pt-BR")),
        );
      }
    }

    statesByCountryCode.set(
      code,
      states.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    );
  }

  localitiesCache = {
    countries: countries.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    statesByCountryCode,
    citiesByCountryState,
  };

  return localitiesCache;
}

export function getLocalityCountries(): LocalityCountry[] {
  return loadLocalitiesCache().countries;
}

export function getLocalityStates(countryCode: string): LocalityState[] {
  const normalizedCode = String(countryCode ?? "").trim().toUpperCase();
  if (normalizedCode.length !== 2) return [];
  return loadLocalitiesCache().statesByCountryCode.get(normalizedCode) ?? [];
}

export function getLocalityCities(countryCode: string, stateName: string, search?: string): string[] {
  const key = cityKey(String(countryCode ?? ""), String(stateName ?? ""));
  const all = loadLocalitiesCache().citiesByCountryState.get(key) ?? [];
  const normalizedSearch = normalizeToken(String(search ?? ""));
  const filtered = normalizedSearch
    ? all.filter((name) => normalizeToken(name).includes(normalizedSearch))
    : all;
  return filtered.slice(0, 100);
}
