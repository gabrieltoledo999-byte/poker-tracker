// Currency conversion service
// Primary: open.er-api.com (free, no auth, updated daily)
// Fallback: frankfurter.dev (ECB rates, free, no auth)
// Cache: 1 hour (to stay reasonably fresh without hammering APIs)

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

interface RateCache {
  rate: number;
  timestamp: number;
  source: "api" | "fallback";
  fetchedAt: string; // ISO date string for display
}

// In-memory caches
let usdCache: RateCache | null = null;
let jpyCache: RateCache | null = null;
let cadCache: RateCache | null = null;
let cnyCache: RateCache | null = null;

function isCacheValid(cache: RateCache | null): boolean {
  if (!cache) return false;
  return Date.now() - cache.timestamp < CACHE_DURATION;
}

// Fetch all three rates in a single request from open.er-api.com
async function fetchAllRatesFromOpenER(): Promise<{ BRL: number; CAD: number; JPY: number; CNY: number }> {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`open.er-api HTTP ${response.status}`);
  const data: any = await response.json();
  if (data.result !== "success") throw new Error(`open.er-api: ${data["error-type"] ?? "unknown error"}`);
  const rates = data.rates;
  return {
    BRL: rates.BRL,
    CAD: rates.CAD,
    JPY: rates.JPY,
    CNY: rates.CNY,
  };
}

// Fallback: frankfurter.dev (ECB-sourced, free)
async function fetchAllRatesFromFrankfurter(): Promise<{ BRL: number; CAD: number; JPY: number; CNY: number }> {
  const response = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL,CAD,JPY,CNY", {
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`frankfurter HTTP ${response.status}`);
  const data: any = await response.json();
  return {
    BRL: data.rates.BRL,
    CAD: data.rates.CAD,
    JPY: data.rates.JPY,
    CNY: data.rates.CNY,
  };
}

// Fetch all rates once and populate all three caches
async function refreshAllCaches(): Promise<void> {
  const now = Date.now();
  const fetchedAt = new Date().toISOString();

  try {
    const rates = await fetchAllRatesFromOpenER();
    usdCache = { rate: rates.BRL, timestamp: now, source: "api", fetchedAt };
    cadCache = { rate: rates.BRL / rates.CAD, timestamp: now, source: "api", fetchedAt };
    jpyCache = { rate: rates.BRL / rates.JPY, timestamp: now, source: "api", fetchedAt };
    cnyCache = { rate: rates.BRL / rates.CNY, timestamp: now, source: "api", fetchedAt };
    console.log(`[Currency] Rates updated from open.er-api: USD=${rates.BRL?.toFixed(4)}, CAD=${(rates.BRL / rates.CAD)?.toFixed(4)}, JPY=${(rates.BRL / rates.JPY)?.toFixed(6)}, CNY=${(rates.BRL / rates.CNY)?.toFixed(4)}`);
    return;
  } catch (err) {
    console.warn("[Currency] open.er-api failed, trying frankfurter.dev:", err);
  }

  try {
    const rates = await fetchAllRatesFromFrankfurter();
    usdCache = { rate: rates.BRL, timestamp: now, source: "api", fetchedAt };
    cadCache = { rate: rates.BRL / rates.CAD, timestamp: now, source: "api", fetchedAt };
    jpyCache = { rate: rates.BRL / rates.JPY, timestamp: now, source: "api", fetchedAt };
    cnyCache = { rate: rates.BRL / rates.CNY, timestamp: now, source: "api", fetchedAt };
    console.log(`[Currency] Rates updated from frankfurter.dev: USD=${rates.BRL?.toFixed(4)}, CAD=${(rates.BRL / rates.CAD)?.toFixed(4)}, JPY=${(rates.BRL / rates.JPY)?.toFixed(6)}, CNY=${(rates.BRL / rates.CNY)?.toFixed(4)}`);
    return;
  } catch (err) {
    console.error("[Currency] Both APIs failed:", err);
    throw err;
  }
}

async function ensureCachesPopulated(): Promise<void> {
  // If any cache is missing or stale, refresh all at once
  if (!isCacheValid(usdCache) || !isCacheValid(cadCache) || !isCacheValid(jpyCache) || !isCacheValid(cnyCache)) {
    await refreshAllCaches();
  }
}

export async function getUsdToBrlRate(): Promise<number> {
  try {
    await ensureCachesPopulated();
    if (usdCache) return usdCache.rate;
  } catch (err) {
    console.error("[Currency] Failed to fetch USD/BRL rate:", err);
    if (usdCache) return usdCache.rate; // return stale if available
  }
  // Hard fallback — only if both APIs fail AND no stale cache
  const fallbackRate = 5.80;
  usdCache = { rate: fallbackRate, timestamp: Date.now() - CACHE_DURATION + 5 * 60 * 1000, source: "fallback", fetchedAt: new Date().toISOString() };
  return fallbackRate;
}

export async function getCadToBrlRate(): Promise<number> {
  try {
    await ensureCachesPopulated();
    if (cadCache) return cadCache.rate;
  } catch (err) {
    console.error("[Currency] Failed to fetch CAD/BRL rate:", err);
    if (cadCache) return cadCache.rate;
  }
  const fallbackRate = 4.20;
  cadCache = { rate: fallbackRate, timestamp: Date.now() - CACHE_DURATION + 5 * 60 * 1000, source: "fallback", fetchedAt: new Date().toISOString() };
  return fallbackRate;
}

export async function getJpyToBrlRate(): Promise<number> {
  try {
    await ensureCachesPopulated();
    if (jpyCache) return jpyCache.rate;
  } catch (err) {
    console.error("[Currency] Failed to fetch JPY/BRL rate:", err);
    if (jpyCache) return jpyCache.rate;
  }
  const fallbackRate = 0.038;
  jpyCache = { rate: fallbackRate, timestamp: Date.now() - CACHE_DURATION + 5 * 60 * 1000, source: "fallback", fetchedAt: new Date().toISOString() };
  return fallbackRate;
}

export async function getCnyToBrlRate(): Promise<number> {
  try {
    await ensureCachesPopulated();
    if (cnyCache) return cnyCache.rate;
  } catch (err) {
    console.error("[Currency] Failed to fetch CNY/BRL rate:", err);
    if (cnyCache) return cnyCache.rate;
  }
  const fallbackRate = 0.80;
  cnyCache = { rate: fallbackRate, timestamp: Date.now() - CACHE_DURATION + 5 * 60 * 1000, source: "fallback", fetchedAt: new Date().toISOString() };
  return fallbackRate;
}

/** Returns all exchange rates at once (used by the dashboard) */
export async function getAllRates(): Promise<{
  USD: { rate: number; source: string; fetchedAt: string };
  CAD: { rate: number; source: string; fetchedAt: string };
  JPY: { rate: number; source: string; fetchedAt: string };
  CNY: { rate: number; source: string; fetchedAt: string };
}> {
  const [usdRate, cadRate, jpyRate, cnyRate] = await Promise.all([
    getUsdToBrlRate(),
    getCadToBrlRate(),
    getJpyToBrlRate(),
    getCnyToBrlRate(),
  ]);

  return {
    USD: {
      rate: usdRate,
      source: usdCache?.source ?? "fallback",
      fetchedAt: usdCache?.fetchedAt ?? new Date().toISOString(),
    },
    CAD: {
      rate: cadRate,
      source: cadCache?.source ?? "fallback",
      fetchedAt: cadCache?.fetchedAt ?? new Date().toISOString(),
    },
    JPY: {
      rate: jpyRate,
      source: jpyCache?.source ?? "fallback",
      fetchedAt: jpyCache?.fetchedAt ?? new Date().toISOString(),
    },
    CNY: {
      rate: cnyRate,
      source: cnyCache?.source ?? "fallback",
      fetchedAt: cnyCache?.fetchedAt ?? new Date().toISOString(),
    },
  };
}

/** Force refresh all rates (ignores cache) */
export async function refreshRates(): Promise<{
  USD: { rate: number; source: string; fetchedAt: string };
  CAD: { rate: number; source: string; fetchedAt: string };
  JPY: { rate: number; source: string; fetchedAt: string };
  CNY: { rate: number; source: string; fetchedAt: string };
}> {
  usdCache = null;
  cadCache = null;
  jpyCache = null;
  cnyCache = null;
  return getAllRates();
}

export function convertUsdToBrl(usdCentavos: number, rate: number): number {
  return Math.round(usdCentavos * rate);
}

export function convertBrlToUsd(brlCentavos: number, rate: number): number {
  return Math.round(brlCentavos / rate);
}

export async function convertToBrl(amount: number, currency: "BRL" | "USD" | "CAD" | "JPY" | "CNY"): Promise<number> {
  if (currency === "BRL") return amount;
  if (currency === "USD") {
    const rate = await getUsdToBrlRate();
    return Math.round(amount * rate);
  }
  if (currency === "CAD") {
    const rate = await getCadToBrlRate();
    return Math.round(amount * rate);
  }
  if (currency === "JPY") {
    const rate = await getJpyToBrlRate();
    return Math.round(amount * rate);
  }
  if (currency === "CNY") {
    const rate = await getCnyToBrlRate();
    return Math.round(amount * rate);
  }
  return amount;
}
