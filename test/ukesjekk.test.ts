import { describe, expect, it } from "vitest";
import { ukesjekk } from "../src/lib/ukesjekk";

const ingen = () => undefined;
const ansatt = (id: string, navn: string) => ({ id, navn, aktiv: true });
const time = (ansatt_id: string, dato: string, timer = 7.5, x = {}) => ({ id: `${ansatt_id}${dato}`, ansatt_id, dato, timer, prosjekt_id: "p1", status: "godkjent", ...x });

describe("ukesjekk", () => {
  // Torsdag 22. oktober 2026
  const idag = "2026-10-22";
  const grunn: any = { maal: 4600, ansatte: [ansatt("a", "Ola Nordmann"), ansatt("b", "Kari Holm")], soknader: [], timer: [], avvik: [], modulerAv: [] };

  it("hopper over timepunktene når ingen fører timer i appen", () => {
    expect(ukesjekk(grunn, idag, [], ingen).map((p) => p.id)).toEqual([]);
  });
  it("viser fakturerbare timer mot ukemålet og hvem som mangler timer", () => {
    const d = { ...grunn, timer: [
      ...["2026-10-19", "2026-10-20", "2026-10-21"].map((x) => time("a", x)),
      time("b", "2026-10-19"), time("b", "2026-10-12", 7.5, { status: "levert" }),
    ] };
    const p = ukesjekk(d, idag, [], ingen);
    const timer = p.find((x) => x.id === "timer")!;
    expect(timer.tittel).toBe("30 fakturerbare timer denne uka");
    expect(timer.detalj).toBe("Mål så langt i uka: 80 t (38 %)"); // 4600 / 46 = 100 i uka, mandag–torsdag = 4 av 5 dager
    expect(timer.ok).toBe(false);
    expect(p.find((x) => x.id === "mangler")!.detalj).toBe("Kari (2)");
    expect(p.find((x) => x.id === "godkjenn")!.tittel).toBe("1 timeføringer fra tidligere uker er ikke godkjent");
  });
  it("tar ikke med moduler som er slått av", () => {
    const d = { ...grunn, modulerAv: ["tilbud"] };
    const t: any = { id: "t", status: "apen", utfall: null, dato: "2026-10-01", neste_kontakt: null, belop: 90000 };
    expect(ukesjekk(d, idag, [t], ingen).some((x) => x.id === "tilbud")).toBe(false);
    expect(ukesjekk(grunn, idag, [t], ingen).find((x) => x.id === "tilbud")!.tittel).toBe("1 tilbud å følge opp (alle selgere)");
    const egen = ukesjekk(grunn, idag, [{ ...t, selger_navn: "Ola Nordmann" }], ingen, "Ola Nordmann").find((x) => x.id === "tilbud")!;
    expect(egen.detalj).toMatch(/^90\s000 kr · 1 av dem er dine \(90\s000 kr\)$/);
  });
  it("teller ikke Svenn-ansatte som «mangler timer» etter siste Svenn-import, og minner om importen", () => {
    const d = { ...grunn, timer: [
      ...["2026-10-19", "2026-10-20", "2026-10-21"].map((x) => time("a", x)),
      time("b", "2026-10-19", 7.5, { kilde: "svenn" }),
    ] };
    const p = ukesjekk(d, idag, [], ingen);
    expect(p.find((x) => x.id === "mangler")!.ok).toBe(true);
    const sv = p.find((x) => x.id === "svenn")!;
    expect(sv.tittel).toContain("Timene fra Svenn er importert t.o.m.");
    expect(sv.detalj).toContain("1 ansatt fører fortsatt i Svenn");
  });
});
