import { describe, it, expect } from "vitest";
import { demoApi } from "../src/lib/demo";
import { frister, statusEtterVarsel } from "../src/lib/ns";

const idag = () => new Date().toISOString().slice(0, 10);
async function innlogget(epost: string) {
  const api = demoApi();
  await api.bekreftKode(epost, "123456");
  return api;
}

describe("ByggLogg Kontrakt i demoen", () => {
  it("demoprosjektet har NS 8405-kontrakt, saker og varsler som fristmotoren forstår", async () => {
    const api = await innlogget("lars@demo.no");
    const d = await api.hent();
    const k = d.kontrakter!.find((x) => x.prosjekt_id === "p4")!;
    expect(k.standard).toBe("8405");
    const saker = d.nsSaker!.filter((s) => s.kontrakt_id === k.id);
    expect(saker.map((s) => s.nr).sort()).toEqual([1, 2, 3]);
    expect(d.tillegg.find((t) => t.sak_id === "ns3")?.pris).toBe(148000);
    const f = frister(k, saker, d.nsVarsler!, d.kontraktFrister!.filter((x) => x.kontrakt_id === k.id), idag());
    // Sak 1 er ikke varslet, sak 2 venter på svar og er passert, sak 3 er avklart og gir ingen frist
    expect(f.some((x) => x.sak_id === "ns1" && x.preklusiv && x.niva === "snart")).toBe(true);
    expect(f.some((x) => x.sak_id === "ns2" && x.niva === "over" && x.hvem === "daglig_leder")).toBe(true);
    expect(f.some((x) => x.sak_id === "ns3")).toBe(false);
    // Ferdige kontraktsfrister vises ikke
    expect(f.some((x) => x.hva.startsWith("Stillas"))).toBe(false);
  });

  it("alle ansatte kan melde en sak, løpenummeret settes automatisk", async () => {
    const api = await innlogget("ola@demo.no");
    const id = await api.lagreNsSak({ kontrakt_id: "kt1", type: "plunder_heft", tittel: "Andre fag i veien på stillaset" });
    const s = (await api.hent()).nsSaker!.find((x) => x.id === id)!;
    expect(s.nr).toBe(4);
    expect(s.prosjekt_id).toBe("p4");
    expect(s.meldt_av).toBe("mads");
    expect(s.status).toBe("ny");
    // Den som meldte kan rette så lenge saken er ny, men ikke saker andre har meldt
    await api.lagreNsSak({ id, kontrakt_id: "kt1", type: "plunder_heft", tittel: "Andre fag i veien på stillaset nord" });
    await expect(api.lagreNsSak({ id: "ns1", kontrakt_id: "kt1", type: "irregulaer", tittel: "x" })).rejects.toThrow();
  });

  it("bare leder og prosjektleder registrerer kontrakt og varsler", async () => {
    const ansatt = await innlogget("ola@demo.no");
    await expect(ansatt.lagreKontrakt({ prosjekt_id: "p1", standard: "8406" })).rejects.toThrow();
    await expect(ansatt.lagreNsVarsel({ sak_id: "ns1", retning: "ut", type: "varsel" })).rejects.toThrow();
    const pl = await innlogget("nina@demo.no");
    const kid = await pl.lagreKontrakt({ prosjekt_id: "p1", standard: "8406" });
    expect((await pl.hent()).kontrakter!.find((k) => k.id === kid)?.varsel_dager).toBe(5);
    await expect(pl.lagreKontrakt({ prosjekt_id: "p1", standard: "8405" })).rejects.toThrow(/allerede/);
    await expect(pl.slettKontrakt(kid)).rejects.toThrow(); // bare leder sletter
  });

  it("sendt varsel flytter saken videre og kan ikke endres eller slettes", async () => {
    const api = await innlogget("nina@demo.no");
    const vid = await api.lagreNsVarsel({ sak_id: "ns1", retning: "ut", type: "varsel", tekst: "Utkast" });
    expect((await api.hent()).nsSaker!.find((s) => s.id === "ns1")?.status).toBe("ny"); // utkast endrer ikke status
    await api.lagreNsVarsel({ id: vid, sak_id: "ns1", retning: "ut", type: "varsel", tekst: "Vi varsler …", sendt: new Date().toISOString(), sendt_til: "eva.lie@demo.no" });
    const d = await api.hent();
    expect(d.nsSaker!.find((s) => s.id === "ns1")?.status).toBe("varslet");
    await expect(api.lagreNsVarsel({ id: vid, sak_id: "ns1", retning: "ut", type: "varsel", tekst: "Endret" })).rejects.toThrow(/sendt/);
    await expect(api.slettNsVarsel(vid)).rejects.toThrow(/sendt/);
    // Svar fra byggherren kan legges til på et sendt varsel
    await api.lagreNsVarsel({ id: vid, sak_id: "ns1", retning: "ut", type: "varsel", svar: "Mottatt", svar_tid: new Date().toISOString() });
  });

  it("status etter varsel følger samme regel som databasen", () => {
    expect(statusEtterVarsel("ny", "varsel")).toBe("varslet");
    expect(statusEtterVarsel("varslet", "krav")).toBe("krav");
    expect(statusEtterVarsel("ny", "krav")).toBe("krav");
    expect(statusEtterVarsel("avklart", "krav")).toBe("avklart");
    expect(statusEtterVarsel("krav", "varsel")).toBe("krav");
  });
});
