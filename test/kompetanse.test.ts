import { describe, it, expect } from "vitest";
import { besteBevis, kStatus, trengerFornyelse, type Kompetanse } from "../src/lib/kompetanse";

const k = (id: string, ansatt_id: string, type: string, gyldig_til: string | null) =>
  ({ id, ansatt_id, type, gyldig_til, navn: "", utsteder: "", utstedt: null, sti: null, filnavn: "", merknad: "", opprettet: "" }) as Kompetanse;

describe("kompetanse", () => {
  it("status ut fra gyldighet", () => {
    expect(kStatus(k("1", "a", "hms", null), "2026-10-12")).toBe("gyldig");
    expect(kStatus(k("1", "a", "hms", "2026-10-11"), "2026-10-12")).toBe("utlopt");
    expect(kStatus(k("1", "a", "hms", "2026-12-01"), "2026-10-12")).toBe("snart");
    expect(kStatus(k("1", "a", "hms", "2027-06-01"), "2026-10-12")).toBe("gyldig");
  });
  it("nytt bevis erstatter gammelt i oversikten og varslingen", () => {
    const liste = [k("1", "a", "hms", "2026-11-01"), k("2", "a", "hms", "2028-11-01"), k("3", "b", "stillas", "2026-01-01")];
    expect(besteBevis(liste).get("a|hms")?.id).toBe("2");
    expect(trengerFornyelse(liste, "2026-10-12").map((x) => x.id)).toEqual(["3"]);
  });
});

import { finnDatoer, lesBevis } from "../src/lib/kompetanse";
describe("lesing av kursbevis", () => {
  it("finner datoer i mange formater", () => {
    expect(finnDatoer("12.03.2024 og 2025-01-05 og 3. mars 2026 og March 4, 2027").map((x) => x.dato))
      .toEqual(["2024-03-12", "2025-01-05", "2026-03-03", "2027-03-04"]);
    expect(finnDatoer("31.02.2024")).toEqual([]);
  });
  it("leser stillaskurs med gyldig til", () => {
    const f = lesBevis("KURSBEVIS\nStillasmontør inntil 9 m\nNavn: Dawid Reiske\nKursdato: 14.05.2024\nGyldig til: 14.05.2029\nAKA AS");
    expect(f).toMatchObject({ type: "stillas", utstedt: "2024-05-14", gyldig_til: "2029-05-14", utsteder: "AKA" });
    expect(f.navn).toBe("Inntil 9 m");
  });
  it("leser kurstittel fra diplom", () => {
    const d = (tittel: string, kode: string, dato: string, beskr: string) => `DIPLOM\nDELTAKER\nMats Lausund\n${tittel}\n${kode}\nGJENNOMFØRT\n${dato}\nBeskrivelse\n${beskr}`;
    expect(lesBevis(d("Prosjekt fareblind", "SfS001", "30. oktober 2024", "Kursbeviset er gyldig i 3 år fra gjennomføringsdato."))).toMatchObject({ type: "sikkerhet", navn: "Prosjekt fareblind", utstedt: "2024-10-30", gyldig_til: "2027-10-30" });
    expect(lesBevis(d("HMS-regelverk", "EBA001", "10. desember 2022", "Risikovurdering og opplæringskrav."))).toMatchObject({ type: "sikkerhet", navn: "HMS-regelverk", ingenUtlop: true });
    expect(lesBevis(d("Arbeid i høyden", "EO-00105-NO", "31. mars 2023", "Du har bestått kurset."))).toMatchObject({ type: "hoyde", utstedt: "2023-03-31" });
    expect(lesBevis(d("Klima, miljø og bærekraft i\nbyggenæringen", "Byggopp016", "24. oktober 2024", "Kravene til fagarbeidere.")).navn).toBe("Klima, miljø og bærekraft");
  });
  it("finner kursholder med AS i navnet", () => {
    expect(lesBevis("TESTKURS AS\nKURSBEVIS\nStillasmontør\nKursdato: 14.05.2024\nGyldig til: 14.05.2029").utsteder).toBe("TESTKURS AS");
  });
  it("regner ut utløp fra varighet", () => {
    expect(lesBevis("Førstehjelpskurs\nGjennomført 02.10.2025\nKurset er gyldig i 2 år")).toMatchObject({ type: "forstehjelp", utstedt: "2025-10-02", gyldig_til: "2027-10-02" });
  });
  it("sier fra når det ikke er utløp", () => {
    expect(lesBevis("Fagbrev i tømrerfaget\nDato: 20.06.2015")).toMatchObject({ type: "fagbrev", utstedt: "2015-06-20", ingenUtlop: true });
  });
  it("leser truck-klasser og engelsk/polsk", () => {
    expect(lesBevis("Forklift certificate\nClass: T1, T4\nDate of issue: 01/02/2023\nValid until 01/02/2028")).toMatchObject({ type: "truck", navn: "Klasse T1, T4", gyldig_til: "2028-02-01" });
    expect(lesBevis("Zaświadczenie praca na wysokości\nData wydania 10.01.2024\nWażny do 10.01.2027")).toMatchObject({ type: "hoyde", utstedt: "2024-01-10", gyldig_til: "2027-01-10" });
  });
});
