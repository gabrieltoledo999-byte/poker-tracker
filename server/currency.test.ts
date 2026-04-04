import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper: mock a successful open.er-api.com response
function mockOpenER(brl: number, cad: number, jpy: number) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      result: "success",
      rates: { BRL: brl, CAD: cad, JPY: jpy },
    }),
  });
}

// Reset modules and caches between tests so each test starts fresh
beforeEach(() => {
  vi.resetModules();
  mockFetch.mockReset();
});

describe("currency module", () => {
  it("convertToBrl returns same amount for BRL", async () => {
    const { convertToBrl } = await import("./currency");
    const result = await convertToBrl(5000, "BRL");
    expect(result).toBe(5000);
  });

  it("convertToBrl converts USD to BRL using real rate", async () => {
    // open.er-api: 1 USD = 5.50 BRL, CAD=1.39, JPY=150
    mockOpenER(5.50, 1.39, 150);

    const { convertToBrl } = await import("./currency");
    const result = await convertToBrl(100, "USD"); // 100 USD-cents * 5.50 = 550 BRL-cents
    expect(result).toBe(550);
  });

  it("convertToBrl converts CAD to BRL using real rate", async () => {
    // 1 USD = 5.50 BRL, 1 USD = 1.375 CAD → 1 CAD = 5.50/1.375 ≈ 4.00 BRL
    mockOpenER(5.50, 1.375, 150);

    const { convertToBrl } = await import("./currency");
    const result = await convertToBrl(100, "CAD"); // 100 CAD-cents * 4.00 = 400 BRL-cents
    expect(result).toBe(400);
  });

  it("convertToBrl converts JPY to BRL using real rate", async () => {
    // 1 USD = 5.50 BRL, 1 USD = 150 JPY → 1 JPY = 5.50/150 ≈ 0.0367 BRL
    mockOpenER(5.50, 1.39, 150);

    const { convertToBrl } = await import("./currency");
    const result = await convertToBrl(100, "JPY"); // 100 JPY-cents * (5.50/150) ≈ 3.67 → 4 BRL-cents
    expect(result).toBe(4);
  });

  it("getAllRates returns USD, CAD and JPY rates with correct structure", async () => {
    mockOpenER(5.50, 1.375, 150);

    const { getAllRates } = await import("./currency");
    const rates = await getAllRates();

    expect(rates).toHaveProperty("USD");
    expect(rates).toHaveProperty("CAD");
    expect(rates).toHaveProperty("JPY");
    expect(rates.USD.rate).toBe(5.5);
    expect(rates.CAD.rate).toBeCloseTo(5.50 / 1.375, 2);
    expect(rates.USD.source).toBe("api");
    expect(rates.CAD.source).toBe("api");
  });

  it("falls back to a positive number when primary API fails (tries frankfurter)", async () => {
    // First call (open.er-api) fails, second call (frankfurter) also fails → hard fallback
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { getUsdToBrlRate } = await import("./currency");
    const rate = await getUsdToBrlRate();

    expect(rate).toBeGreaterThan(0);
    expect(typeof rate).toBe("number");
  });

  it("falls back to frankfurter when open.er-api fails", async () => {
    // open.er-api fails, frankfurter succeeds
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rates: { BRL: 5.20, CAD: 1.40, JPY: 155 },
      }),
    });

    const { getUsdToBrlRate } = await import("./currency");
    const rate = await getUsdToBrlRate();

    expect(rate).toBe(5.20);
  });

  it("falls back to a positive number for CAD when both APIs fail", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { getCadToBrlRate } = await import("./currency");
    const rate = await getCadToBrlRate();

    expect(rate).toBeGreaterThan(0);
    expect(typeof rate).toBe("number");
  });
});
