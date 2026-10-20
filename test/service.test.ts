import { describe, expect, it } from "vitest";
import { drarUt, grunnlag, sisteDag, sorterService, type Serviceoppdrag } from "../src/lib/service";

const s = (x: Partial<Serviceoppdrag>): Serviceoppdrag => ({
  id: "s", kunde_id: "k", kunde_navn: "", telefon: "", epost: "", adresse: "", tittel: "T", beskrivelse: "", prioritet: "uke", status: "planlagt",
  ansvarlig_id: "a", dato: "2026-10-20", dager: 1, kilde: "app", registrert_av: null, materiell: [], merknad: "", ferdig_av: null, ferdig_tid: null,
  visma_ordrenr: "", fakturert_tid: null, signert_navn: "", signatur: "", signert_tid: null, opprettet: "2026-10-01T08:00:00Z", endret: "", ...x,
});

describe("serviceoppdrag", () => {
  it("to dager over en fredag går til mandag", () => {
    expect(sisteDag(s({ dato: "2026-10-23", dager: 2 }))).toBe("2026-10-26");
    expect(sisteDag(s({ dato: "2026-10-20", dager: 2 }))).toBe("2026-10-21");
    expect(sisteDag(s({ dato: "2026-10-20", dager: 1 }))).toBe("2026-10-20");
  });
  it("drar ut når det ikke er ferdig etter siste dag", () => {
    expect(drarUt(s({ dato: "2026-10-20" }), "2026-10-21")).toBe(true);
    expect(drarUt(s({ dato: "2026-10-20", dager: 2 }), "2026-10-21")).toBe(false);
    expect(drarUt(s({ dato: "2026-10-20", status: "ferdig" }), "2026-10-25")).toBe(false);
  });
  it("haster først, ferdige til slutt", () => {
    const l = [s({ id: "1", prioritet: "ledig" }), s({ id: "2", status: "ferdig", prioritet: "haster" }), s({ id: "3", prioritet: "haster" })].sort(sorterService);
    expect(l.map((x) => x.id)).toEqual(["3", "1", "2"]);
  });
  it("fakturagrunnlag: timer × timepris + materiell", () => {
    const g = grunnlag(s({ materiell: [{ beskrivelse: "Hengsel", antall: 2, enhet: "stk", pris: 150 }] }), [{ service_id: "s", timer: 2.5 }, { service_id: "x", timer: 9 }], 750);
    expect(g).toEqual({ timer: 2.5, arbeid: 1875, materiell: 300, sum: 2175 });
  });
});
