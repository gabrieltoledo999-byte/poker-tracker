// Currency conversion service using AwesomeAPI (free, no auth required)

interface ExchangeRateResponse {
  USDBRL: {
    code: string;
    codein: string;
    name: string;
    high: string;
    low: string;
    varBid: string;
    pctChange: string;
    bid: string; // Buy rate
    ask: string; // Sell rate
    timestamp: string;
    create_date: string;
  };
}

let cachedRate: { rate: number; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

export async function getUsdToBrlRate(): Promise<number> {
  // Return cached rate if still valid
  if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_DURATION) {
    return cachedRate.rate;
  }

  try {
    const response = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL");
    
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rate: ${response.status}`);
    }

    const data: ExchangeRateResponse = await response.json();
    const rate = parseFloat(data.USDBRL.bid);

    // Cache the rate
    cachedRate = {
      rate,
      timestamp: Date.now(),
    };

    return rate;
  } catch (error) {
    console.error("[Currency] Failed to fetch USD/BRL rate:", error);
    
    // Return cached rate even if expired, or fallback to approximate rate
    if (cachedRate) {
      return cachedRate.rate;
    }
    
    // Fallback rate (approximate)
    return 5.0;
  }
}

export function convertUsdToBrl(usdCentavos: number, rate: number): number {
  // Convert from USD centavos to BRL centavos
  return Math.round(usdCentavos * rate);
}

export function convertBrlToUsd(brlCentavos: number, rate: number): number {
  // Convert from BRL centavos to USD centavos
  return Math.round(brlCentavos / rate);
}

// JPY exchange rate cache
let cachedJpyRate: { rate: number; timestamp: number } | null = null;

export async function getJpyToBrlRate(): Promise<number> {
  // Return cached rate if still valid
  if (cachedJpyRate && Date.now() - cachedJpyRate.timestamp < CACHE_DURATION) {
    return cachedJpyRate.rate;
  }
  try {
    const response = await fetch("https://economia.awesomeapi.com.br/json/last/JPY-BRL");
    if (!response.ok) {
      throw new Error(`Failed to fetch JPY/BRL rate: ${response.status}`);
    }
    const data: any = await response.json();
    const rate = parseFloat(data.JPYBRL.bid);
    cachedJpyRate = { rate, timestamp: Date.now() };
    return rate;
  } catch (error) {
    console.error("[Currency] Failed to fetch JPY/BRL rate:", error);
    if (cachedJpyRate) return cachedJpyRate.rate;
    return 0.033; // Approximate fallback (1 JPY ≈ R$ 0.033)
  }
}

export async function convertToBrl(amount: number, currency: "BRL" | "USD" | "JPY"): Promise<number> {
  if (currency === "BRL") return amount;
  if (currency === "USD") {
    const rate = await getUsdToBrlRate();
    return Math.round(amount * rate);
  }
  if (currency === "JPY") {
    const rate = await getJpyToBrlRate();
    return Math.round(amount * rate);
  }
  return amount;
}
