// Currency conversion service using AwesomeAPI (free, no auth required)
// Cache duration: 24 hours (daily rates)

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

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

function isCacheValid(cache: RateCache | null): boolean {
  if (!cache) return false;
  return Date.now() - cache.timestamp < CACHE_DURATION;
}

export async function getUsdToBrlRate(): Promise<number> {
  if (isCacheValid(usdCache)) return usdCache!.rate;

  try {
    const response = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data: any = await response.json();
    const rate = parseFloat(data.USDBRL.bid);

    usdCache = {
      rate,
      timestamp: Date.now(),
      source: "api",
      fetchedAt: new Date().toISOString(),
    };

    return rate;
  } catch (error) {
    console.error("[Currency] Failed to fetch USD/BRL rate:", error);

    // Return stale cache if available
    if (usdCache) return usdCache.rate;

    // Fallback rate
    usdCache = { rate: 5.75, timestamp: Date.now(), source: "fallback", fetchedAt: new Date().toISOString() };
    return usdCache.rate;
  }
}

export async function getJpyToBrlRate(): Promise<number> {
  if (isCacheValid(jpyCache)) return jpyCache!.rate;

  try {
    const response = await fetch("https://economia.awesomeapi.com.br/json/last/JPY-BRL", {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data: any = await response.json();
    const rate = parseFloat(data.JPYBRL.bid);

    jpyCache = {
      rate,
      timestamp: Date.now(),
      source: "api",
      fetchedAt: new Date().toISOString(),
    };

    return rate;
  } catch (error) {
    console.error("[Currency] Failed to fetch JPY/BRL rate:", error);

    if (jpyCache) return jpyCache.rate;

    // Fallback: 1 JPY ≈ R$ 0.038
    jpyCache = { rate: 0.038, timestamp: Date.now(), source: "fallback", fetchedAt: new Date().toISOString() };
    return jpyCache.rate;
  }
}

export async function getCadToBrlRate(): Promise<number> {
  if (isCacheValid(cadCache)) return cadCache!.rate;

  try {
    const response = await fetch("https://economia.awesomeapi.com.br/json/last/CAD-BRL", {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data: any = await response.json();
    const rate = parseFloat(data.CADBRL.bid);

    cadCache = {
      rate,
      timestamp: Date.now(),
      source: "api",
      fetchedAt: new Date().toISOString(),
    };

    return rate;
  } catch (error) {
    console.error("[Currency] Failed to fetch CAD/BRL rate:", error);

    if (cadCache) return cadCache.rate;

    // Fallback: 1 CAD ≈ R$ 4.20
    cadCache = { rate: 4.20, timestamp: Date.now(), source: "fallback", fetchedAt: new Date().toISOString() };
    return cadCache.rate;
  }
}

/** Returns all exchange rates at once (used by the dashboard) */
export async function getAllRates(): Promise<{
  USD: { rate: number; source: string; fetchedAt: string };
  CAD: { rate: number; source: string; fetchedAt: string };
  JPY: { rate: number; source: string; fetchedAt: string };
}> {
  const [usdRate, cadRate, jpyRate] = await Promise.all([
    getUsdToBrlRate(),
    getCadToBrlRate(),
    getJpyToBrlRate(),
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
  };
}

/** Force refresh all rates (ignores cache) */
export async function refreshRates(): Promise<{
  USD: { rate: number; source: string; fetchedAt: string };
  CAD: { rate: number; source: string; fetchedAt: string };
  JPY: { rate: number; source: string; fetchedAt: string };
}> {
  usdCache = null;
  cadCache = null;
  jpyCache = null;
  return getAllRates();
}

export function convertUsdToBrl(usdCentavos: number, rate: number): number {
  return Math.round(usdCentavos * rate);
}

export function convertBrlToUsd(brlCentavos: number, rate: number): number {
  return Math.round(brlCentavos / rate);
}

export async function convertToBrl(amount: number, currency: "BRL" | "USD" | "CAD" | "JPY"): Promise<number> {
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
  return amount;
}
