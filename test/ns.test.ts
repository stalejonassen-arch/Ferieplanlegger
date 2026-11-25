import { describe, it, expect } from "vitest";
import { frister, leggTilMnd, niva, preklusiv, epostHolder, punkt, type Kontrakt, type Sak, type Varsel } from "../src/lib/ns";

const k: Kontrakt = { id: "k", standard: "8405", overtakelse: null, sluttfrist: null, varsel_dager: 5 };
const sak = (id: string, nr: number, type: Sak["type"], oppdaget: string, status: Sak["status"] = "ny"): Sak => ({ id, nr, type, tittel: `Sak ${nr}`, oppdaget, status });

describe("NS-regler", () => {
  it("preklusive frister etter standard", () => {
    expect(preklusiv("8405", "irregulaer")).toBe(true);
    expect(preklusiv("8417", "plunder_heft")).toBe(true);
    expect(preklusiv("8406", "irregulaer")).toBe(false);
    expect(preklusiv("8405", "endring")).toBe(false);
  });
  it("e-post som skriftlig må avtales i NS 8405 og 8406", () => {
    expect(epostHolder("8405", false)).toBe(false);
    expect(epostHolder("8405", true)).toBe(true);
    expect(epostHolder("8416", false)).toBe(false);
  });
  it("punkthenvisninger følger standarden underentreprisen speiler", () => {
    expect(punkt("8415", "plunder_heft")).toBe("pkt. 25.3");
    expect(punkt("8407", "medvirkning")).toBe("pkt. 34.1.2");
    expect(punkt("8406", "mengde")).toBe("");
  });
});

describe("fristmotoren", () => {
  it("månedsaritmetikk tåler månedsslutt", () => {
    expect(leggTilMnd("2026-12-31", 2)).toBe("2027-02-28");
    expect(leggTilMnd("2027-03-15", 2)).toBe("2027-05-15");
  });
  it("nivå", () => {
    expect(niva("2027-01-09", "2027-01-10")).toBe("over");
    expect(niva("2027-01-10", "2027-01-10")).toBe("idag");
    expect(niva("2027-01-12", "2027-01-10")).toBe("snart");
    expect(niva("2027-01-30", "2027-01-10")).toBe("ok");
  });
  it("usendt varsel gir frist, og passert frist går til daglig leder", () => {
    const f = frister(k, [sak("a", 1, "irregulaer", "2027-01-02T09:00:00Z")], [], [], "2027-01-10");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ dato: "2027-01-07", niva: "over", hvem: "daglig_leder", preklusiv: true, sak_id: "a" });
  });
  it("sendt varsel fjerner varselfristen og gir oppfølging av svar", () => {
    const v: Varsel[] = [{ sak_id: "a", retning: "ut", type: "varsel", sendt: "2027-01-03T10:00:00Z", svar_tid: null }];
    const f = frister(k, [sak("a", 1, "medvirkning", "2027-01-02T09:00:00Z", "varslet")], v, [], "2027-01-05");
    expect(f.map((x) => x.hva)).toEqual(["Følg opp svar fra byggherren (sak 1)"]);
    expect(f[0]!.dato).toBe("2027-01-10");
    const medSvar = frister(k, [sak("a", 1, "medvirkning", "2027-01-02T09:00:00Z", "varslet")], [{ ...v[0]!, svar_tid: "2027-01-04T08:00:00Z" }], [], "2027-01-05");
    expect(medSvar).toHaveLength(0);
  });
  it("lukkede saker og endringsordrer gir ingen varselfrist", () => {
    const f = frister(k, [sak("a", 1, "endring", "2027-01-02"), sak("b", 2, "mengde", "2027-01-02", "lukket")], [], [], "2027-01-03");
    expect(f).toHaveLength(0);
  });
  it("sluttoppstilling to måneder etter overtakelse, og kontraktsfrister sorteres etter hast", () => {
    const f = frister({ ...k, overtakelse: "2027-03-15" }, [], [],
      [{ id: "1", type: "sluttfrist", tittel: "Ferdig fasade", dato: "2027-03-01", dagmulkt: true, ferdig: false },
       { id: "2", type: "delfrist", tittel: "Stillas ned", dato: "2027-02-01", dagmulkt: false, ferdig: true }], "2027-02-27");
    expect(f.map((x) => x.hva)).toEqual(["Ferdig fasade (dagmulkt)", "Send sluttoppstilling med alle krav og forbehold"]);
    expect(f[1]!.dato).toBe("2027-05-15");
  });
});
