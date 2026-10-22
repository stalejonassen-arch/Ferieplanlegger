import { describe, expect, it } from "vitest";
import { folgOppNaa, oppfolgingsdato, sorterTilbud, treff, type Tilbud } from "../src/lib/tilbud";

const t = (x: Partial<Tilbud>): Tilbud => ({
  id: "x", visma_ordrenr: 1, tilbudsnr: null, dato: "2026-10-01", kunde: "K", kunde_nr: null, referanse: "", belop: 10000, selger_nr: null, selger_navn: "",
  avdeling_nr: null, status: "apen", status_dato: "2026-10-01", utfall: null, sist_kontakt: null, neste_kontakt: null, notat: "", logg: [], ...x,
});

describe("tilbudsoppfølging", () => {
  it("følges opp etter en uke uten kontakt, eller når neste kontakt er nådd", () => {
    expect(folgOppNaa(t({ dato: "2026-10-20" }), "2026-10-22")).toBe(false);
    expect(folgOppNaa(t({ dato: "2026-10-15" }), "2026-10-22")).toBe(true);
    expect(folgOppNaa(t({ dato: "2026-10-01", neste_kontakt: "2026-10-25" }), "2026-10-22")).toBe(false);
    expect(folgOppNaa(t({ dato: "2026-10-01", neste_kontakt: "2026-10-22" }), "2026-10-22")).toBe(true);
    expect(folgOppNaa(t({ dato: "2026-01-01" }), "2026-10-22")).toBe(false); // gammelt, ikke kontaktet
    expect(folgOppNaa(t({ dato: "2026-10-01", utfall: "tapt" }), "2026-10-22")).toBe(false);
    expect(folgOppNaa(t({ dato: "2026-10-01", status: "vunnet" }), "2026-10-22")).toBe(false);
  });
  it("sorteres etter når de skulle vært fulgt opp, så største beløp", () => {
    const a = t({ id: "a", dato: "2026-10-10" }), b = t({ id: "b", dato: "2026-10-01", belop: 5 }), c = t({ id: "c", dato: "2026-10-01", belop: 50 });
    expect(oppfolgingsdato(a)).toBe("2026-10-17");
    expect([a, b, c].sort(sorterTilbud).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
  it("treffprosent regnes av vunnet og tapt", () => {
    const r = treff([
      t({ status: "vunnet", status_dato: "2026-05-01", belop: 100 }), t({ status: "vunnet", status_dato: "2026-06-01", belop: 50 }),
      t({ utfall: "tapt", logg: [{ dato: "2026-06-02", av: null, hva: "tapt", notat: "" }] }), t({ status: "vunnet", status_dato: "2025-12-01" }),
    ], "2026-01-01", "2026-10-22");
    expect(r).toEqual({ vunnet: 2, vunnetKr: 150, tapt: 1, taptKr: 10000, treff: 67 });
  });
});
