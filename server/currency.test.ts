import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Reset modules and caches between tests
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

  it("convertToBrl converts USD to BRL using rate", async () => {
    // Mock the USD rate API
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ USDBRL: { bid: "5.50" } }),
    });

    const { convertToBrl } = await import("./currency");
    const result = await convertToBrl(100, "USD"); // 1 USD = R$5.50
    // 100 cents of USD * 5.50 = 550 BRL cents
    expect(result).toBe(550);
  });

  it("convertToBrl converts CAD to BRL using rate", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ CADBRL: { bid: "4.20" } }),
    });

    const { convertToBrl } = await import("./currency");
    const result = await convertToBrl(100, "CAD"); // 1 CAD = R$4.20
    expect(result).toBe(420);
  });

  it("convertToBrl converts JPY to BRL using rate", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ JPYBRL: { bid: "0.033" } }),
    });

    const { convertToBrl } = await import("./currency");
    const result = await convertToBrl(100, "JPY"); // 100 JPY * 0.033 = 3.3 → 3 BRL cents
    expect(result).toBe(3);
  });

  it("getAllRates returns USD, CAD and JPY rates", async () => {
    // Mock all three API calls
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ USDBRL: { bid: "5.50" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ CADBRL: { bid: "4.20" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ JPYBRL: { bid: "0.033" } }),
      });

    const { getAllRates } = await import("./currency");
    const rates = await getAllRates();

    expect(rates).toHaveProperty("USD");
    expect(rates).toHaveProperty("CAD");
    expect(rates).toHaveProperty("JPY");
    expect(rates.USD.rate).toBe(5.5);
    expect(rates.CAD.rate).toBe(4.2);
    expect(rates.USD.source).toBe("api");
    expect(rates.CAD.source).toBe("api");
  });

  it("falls back to a positive number when API fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { getUsdToBrlRate } = await import("./currency");
    const rate = await getUsdToBrlRate();

    // Should return a positive fallback rate
    expect(rate).toBeGreaterThan(0);
    expect(typeof rate).toBe("number");
  });

  it("falls back to a positive number for CAD when API fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { getCadToBrlRate } = await import("./currency");
    const rate = await getCadToBrlRate();

    // Should return a positive fallback rate
    expect(rate).toBeGreaterThan(0);
    expect(typeof rate).toBe("number");
  });
});
