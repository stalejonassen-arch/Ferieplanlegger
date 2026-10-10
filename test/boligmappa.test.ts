import { describe, it, expect } from "vitest";
import { apneZip } from "../src/lib/svenn";
import { delAdresse, eiendom, klarForBoligmappa, lagZip, lesKartverket, matrikkelTekst } from "../src/lib/boligmappa";
import type { Prosjekt } from "../src/lib/timer";

describe("boligmappa", () => {
  it("leser treff fra Kartverket", () => {
    const t = lesKartverket({ adresser: [{ adressetekst: "Larsnilsvegen 41", postnummer: "6290", poststed: "HARAMSØY", kommunenummer: "1508", kommunenavn: "ÅLESUND", gardsnummer: 101, bruksnummer: 12, festenummer: 0, undernummer: 0, bruksenhetsnummer: ["H0101"] }] });
    expect(t[0]).toMatchObject({ adresse: "Larsnilsvegen 41", kommunenr: "1508", gnr: 101, bnr: 12, fnr: null, snr: null, bruksenheter: ["H0101"] });
  });
  it("matrikkeltekst og klarliste", () => {
    const e = eiendom({ kommunenr: "1508", kommune: "Ålesund", gnr: 101, bnr: 12, fnr: 3 } as Prosjekt);
    expect(e.fag).toBe("Tømrer");
    expect(matrikkelTekst(e)).toBe("1508 Ålesund, gnr. 101 / bnr. 12 / fnr. 3");
    expect(matrikkelTekst(eiendom({} as Prosjekt))).toBe("");
    const k = klarForBoligmappa(e, "Vegen 1", { dagbok: 0, bilder: 2, fdv: 0, sjekklister: 0 });
    expect(k.filter((x) => x.krav && !x.ok).map((x) => x.tekst)).toEqual(["Beskrivelse av utført arbeid (dagbok)"]);
  });
  it("deler adresse", () => {
    expect(delAdresse("Larsnilsvegen 41, 6290 Haramsøy")).toEqual({ adresse: "Larsnilsvegen 41", postnr: "6290", poststed: "Haramsøy" });
    expect(delAdresse("Brattvåg")).toEqual({ adresse: "Brattvåg", postnr: "", poststed: "" });
  });
  it("lager zip som kan leses igjen", async () => {
    const z = lagZip([{ navn: "boligmappa.json", data: new TextEncoder().encode('{"a":1}') }, { navn: "bilder/ø.jpg", data: new Uint8Array([0xff, 0xd8, 1]) }]);
    const zip = apneZip(z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer);
    expect(zip.navn).toEqual(["boligmappa.json", "bilder/ø.jpg"]);
    expect(new TextDecoder().decode((await zip.les("boligmappa.json"))!)).toBe('{"a":1}');
    expect(Array.from((await zip.les("bilder/ø.jpg"))!)).toEqual([0xff, 0xd8, 1]);
  });
});
