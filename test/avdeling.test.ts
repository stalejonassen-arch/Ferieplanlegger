import { describe, expect, it } from "vitest";
import { iFjor, iPeriode, summer, type AvdelingSalg } from "../src/lib/avdeling";

const o = (nr: number, dato: string | null, omsetning: number, db: number, kostnad: number): AvdelingSalg =>
  ({ visma_ordrenr: nr, avdeling_nr: 3, ordredato: dato, fakturadato: dato, kunde: "K", selger_nr: null, ordresum: 0, omsetning, db, kostnad });

describe("avdelingsrapport", () => {
  it("teller salg, trekker fra kreditnota og holder ordre uten innkjøpspris utenfor DG", () => {
    const s = summer([
      o(1, "2026-03-01", 100000, 25000, 75000),
      o(2, "2026-03-05", 50000, 50000, 0),       // mangler innkjøpspris
      o(3, "2026-03-06", -50000, -50000, 0),     // kreditnota på den
      o(4, "2026-03-07", 50000, 10000, 40000),
      o(5, null, 0, 0, 0),                        // ikke fakturert
    ]);
    expect(s.antall).toBe(2);
    expect(s.omsetning).toBe(150000);
    expect(s.medKost).toEqual({ omsetning: 150000, db: 35000, dg: 23.3 });
    expect(s.utenKost.antall).toBe(0);
  });
  it("perioder og samme dag i fjor", () => {
    expect(iFjor("2028-02-29")).toBe("2027-02-28");
    expect(iPeriode([o(1, "2026-01-31", 1, 1, 1), o(2, "2026-02-01", 1, 1, 1)], "2026-01-01", "2026-01-31")).toHaveLength(1);
  });
});
