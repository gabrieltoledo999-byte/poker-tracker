import { describe, expect, it } from "vitest";
import { getCanonicalPlatformForTableOrSession } from "./db";

describe("getCanonicalPlatformForTableOrSession", () => {
  it("prefers table venue over session venue when both exist", () => {
    const result = getCanonicalPlatformForTableOrSession({
      tableVenueId: 22,
      sessionVenueId: 10,
      tableUpdatedAt: new Date("2026-05-21T10:00:00Z"),
      sessionUpdatedAt: new Date("2026-05-21T09:00:00Z"),
    });

    expect(result.venueId).toBe(22);
    expect(result.source).toBe("table");
  });

  it("uses session venue as fallback for legacy sessions without tables", () => {
    const result = getCanonicalPlatformForTableOrSession({
      tableVenueId: null,
      sessionVenueId: 33,
      sessionUpdatedAt: new Date("2026-05-21T08:00:00Z"),
    });

    expect(result.venueId).toBe(33);
    expect(result.source).toBe("session");
  });

  it("returns none when both table and session venues are missing", () => {
    const result = getCanonicalPlatformForTableOrSession({
      tableVenueId: null,
      sessionVenueId: null,
    });

    expect(result.venueId).toBeNull();
    expect(result.source).toBe("none");
  });

  it("treats invalid numeric values as missing", () => {
    const result = getCanonicalPlatformForTableOrSession({
      tableVenueId: Number.NaN,
      sessionVenueId: 44,
    });

    expect(result.venueId).toBe(44);
    expect(result.source).toBe("session");
  });

  it("scenario 1 - finalized session: edited table platform becomes canonical", () => {
    const result = getCanonicalPlatformForTableOrSession({
      tableVenueId: 2, // BSOP (edited)
      sessionVenueId: 1, // H2 (old)
      tableUpdatedAt: new Date("2026-05-21T15:10:00Z"),
      sessionUpdatedAt: new Date("2026-05-21T14:00:00Z"),
    });

    expect(result.venueId).toBe(2);
    expect(result.source).toBe("table");
  });

  it("scenario 2 - active session: edited active table platform is canonical", () => {
    const result = getCanonicalPlatformForTableOrSession({
      tableVenueId: 2, // BSOP (edited during active session)
      sessionVenueId: null,
      tableUpdatedAt: new Date("2026-05-21T16:10:00Z"),
    });

    expect(result.venueId).toBe(2);
    expect(result.source).toBe("table");
  });

  it("scenario 3 - legacy session: session venue fallback is canonical", () => {
    const result = getCanonicalPlatformForTableOrSession({
      tableVenueId: null,
      sessionVenueId: 2, // BSOP edited in legacy session without tables
      sessionUpdatedAt: new Date("2026-05-21T17:10:00Z"),
    });

    expect(result.venueId).toBe(2);
    expect(result.source).toBe("session");
  });

  it("scenario 4 - conflict sessions vs session_tables: table platform prevails", () => {
    const result = getCanonicalPlatformForTableOrSession({
      tableVenueId: 2, // BSOP
      sessionVenueId: 1, // H2
      tableUpdatedAt: new Date("2026-05-21T18:10:00Z"),
      sessionUpdatedAt: new Date("2026-05-21T18:11:00Z"),
    });

    expect(result.venueId).toBe(2);
    expect(result.source).toBe("table");
  });
});
