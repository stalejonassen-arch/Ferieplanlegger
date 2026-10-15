import { describe, it, expect } from "vitest";
import { adresseTekst, koblAnsatte, plan, samleTimer, tilKunde, tilProsjekt, txFeil, velgAktivitet } from "../supabase/functions/tripletex-sync/logikk";

const naa = "2026-10-15T20:00:00.000Z";

describe("Tripletex: kunder og prosjekter", () => {
  it("kunde får postadresse, mobil foran fast telefon, og inaktiv blir ikke aktiv", () => {
    const k = tilKunde({ id: 7, name: " Byggmester Hansen AS ", customerNumber: 10001, phoneNumber: "70000000", phoneNumberMobile: "90000000",
      isInactive: true, postalAddress: { addressLine1: "Storgata 1", postalCode: "6005", city: "Ålesund" } }, 3, naa);
    expect(k).toMatchObject({ bedrift_id: 3, tripletex_id: 7, navn: "Byggmester Hansen AS", adresse: "Storgata 1", postnr: "6005", poststed: "Ålesund", telefon: "90000000", aktiv: false });
  });
  it("kunde uten postadresse bruker besøksadressen, og uten navn får et navn", () => {
    const k = tilKunde({ id: 8, customerNumber: 10002, physicalAddress: { addressLine1: "Kaia 2", postalCode: "6002", city: "Ålesund" } }, 3, naa);
    expect(k.navn).toBe("Kunde 10002");
    expect(k.adresse).toBe("Kaia 2");
  });
  it("prosjekt kobles til kunde, får adresse på én linje og er avsluttet når det er lukket eller sluttdato er passert", () => {
    const kunder = new Map([[7, "kunde-uuid"]]);
    const p = tilProsjekt({ id: 55, number: "2024-12", name: "Tilbygg Myrvang", customer: { id: 7 }, startDate: "2026-09-01",
      deliveryAddress: { addressLine1: "Myrvegen 3", postalCode: "6020", city: "Ålesund" } }, 3, kunder, naa, "2026-10-15");
    expect(p).toMatchObject({ tripletex_id: 55, tripletex_nr: "2024-12", kunde_id: "kunde-uuid", adresse: "Myrvegen 3, 6020 Ålesund", aktiv: true });
    expect(tilProsjekt({ id: 56, isClosed: true }, 3, kunder, naa, "2026-10-15").aktiv).toBe(false);
    expect(tilProsjekt({ id: 57, endDate: "2026-10-14" }, 3, kunder, naa, "2026-10-15").aktiv).toBe(false);
    expect(tilProsjekt({ id: 58, customer: { id: 99 } }, 3, kunder, naa, "2026-10-15").kunde_id).toBeNull();
  });
  it("adresse uten deler blir tom", () => {
    expect(adresseTekst(null)).toBe("");
    expect(adresseTekst({ city: "Haram" })).toBe("Haram");
  });
});

describe("Tripletex: ansatte", () => {
  it("kobler på e-post uten å bry seg om store bokstaver, ellers på ansattnummer, og bare når noe endres", () => {
    const egne = [
      { id: "a", epost: "Ola@Firma.no", ansattnr: null, tripletex_id: null },
      { id: "b", epost: null, ansattnr: "12", tripletex_id: null },
      { id: "c", epost: "kari@firma.no", ansattnr: null, tripletex_id: 3 },
      { id: "d", epost: "ukjent@firma.no", ansattnr: null, tripletex_id: null },
    ];
    const tx = [{ id: 1, email: "ola@firma.no" }, { id: 2, employeeNumber: "12" }, { id: 3, email: "kari@firma.no" }];
    expect(koblAnsatte(egne, tx)).toEqual([{ id: "a", tripletex_id: 1 }, { id: "b", tripletex_id: 2 }]);
  });
});

describe("Tripletex: timer", () => {
  const r = (ansatt_id: string, prosjekt_id: string, dato: string, timer: number, beskrivelse = "") => ({ ansatt_id, prosjekt_id, dato, timer, beskrivelse });
  it("slår sammen timer per ansatt, prosjekt og dag, og samler ulike beskrivelser", () => {
    const s = samleTimer([r("a", "p", "2026-10-12", 4, "Riving"), r("a", "p", "2026-10-12", 3.5, "Riving"), r("a", "p", "2026-10-12", 0.25, "Rydding"), r("a", "q", "2026-10-12", 2), r("b", "p", "2026-10-12", 7.5)]);
    expect(s).toHaveLength(3);
    expect(s.find((x) => x.nokkel === "a|p|2026-10-12")).toMatchObject({ timer: 7.75, kommentar: "Riving; Rydding" });
  });
  it("sender nye dager, oppdaterer endrede og lar like være", () => {
    const s = samleTimer([r("a", "p", "2026-10-12", 7.5), r("a", "p", "2026-10-13", 8), r("a", "p", "2026-10-14", 6)]);
    const sendt = new Map([["a|p|2026-10-12", { tripletex_id: 100, timer: 7.5 }], ["a|p|2026-10-13", { tripletex_id: 101, timer: 7.5 }]]);
    const p = plan(s, sendt);
    expect(p.nye.map((x) => x.dato)).toEqual(["2026-10-14"]);
    expect(p.endret).toEqual([expect.objectContaining({ dato: "2026-10-13", timer: 8, tripletex_id: 101 })]);
  });
  it("velger valgt aktivitet, ellers en arbeidsaktivitet, ellers den første", () => {
    const a = [{ id: 1, name: "Administrasjon" }, { id: 2, name: "Arbeid" }, { id: 3, name: "Kjøring" }];
    expect(velgAktivitet(a, 3)).toBe(3);
    expect(velgAktivitet(a, 99)).toBe(2);
    expect(velgAktivitet([{ id: 5, name: "Annet" }])).toBe(5);
    expect(velgAktivitet([])).toBeNull();
  });
});

describe("Tripletex: feilmeldinger", () => {
  it("gir forståelige meldinger for ugyldig nøkkel og valideringsfeil", () => {
    expect(txFeil(401, null)).toMatch(/godtok ikke nøkkelen/);
    expect(txFeil(422, { message: "Validering feilet", validationMessages: [{ field: "hours", message: "For mange timer" }] }))
      .toBe("Tripletex svarte 422: Validering feilet (hours: For mange timer)");
  });
});
