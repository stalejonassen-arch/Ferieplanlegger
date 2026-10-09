import { describe, expect, it } from "vitest";
import { gyldigLenke, lesestatus, periodeNavn, uleste, type Rapport } from "../src/lib/rapport";

const r = (id: string, publisert: string | null): Rapport => ({ id, tittel: id, periode: "2026-09-01", ingress: "", lenke: "https://a.no", sti: "", publisert, opprettet: "" });
const ansatte = [{ id: "a", navn: "Jim", aktiv: true }, { id: "b", navn: "Mads", aktiv: true }, { id: "c", navn: "Borte", aktiv: false }];

describe("månedsrapporter", () => {
  it("uleste teller bare publiserte rapporter jeg ikke har åpnet", () => {
    const rs = [r("1", "2026-10-10"), r("2", null), r("3", "2026-11-10")];
    expect(uleste(rs, [{ rapport_id: "1", ansatt_id: "a", lest: "" }], "a").map((x) => x.id)).toEqual(["3"]);
    expect(uleste(rs, [{ rapport_id: "1", ansatt_id: "a", lest: "" }], "b").map((x) => x.id)).toEqual(["1", "3"]);
  });
  it("lesestatus deler aktive ansatte i lest og mangler", () => {
    const s = lesestatus(r("1", "x"), [{ rapport_id: "1", ansatt_id: "b", lest: "t" }, { rapport_id: "1", ansatt_id: "c", lest: "t" }], ansatte);
    expect(s.lest.map((x) => x.ansatt.navn)).toEqual(["Mads"]);
    expect(s.mangler.map((x) => x.navn)).toEqual(["Jim"]);
  });
  it("periode og lenke", () => {
    expect(periodeNavn("2026-09-01")).toBe("september 2026");
    expect(gyldigLenke("https://claude.ai/artifact/x")).toBe(true);
    expect(gyldigLenke("javascript:alert(1)")).toBe(false);
    expect(gyldigLenke("")).toBe(true);
  });
});
