import { describe, it, expect } from "vitest";
import { foreslaKobling, importRader, lesSvenn, svennProsjekter } from "../src/lib/svenn";
import type { Prosjekt } from "../src/lib/timer";

const hode = ["Dato", "Kunde", "Prosjekt", "Prosjektnummer", "Oppgave", "Ansatt", "Ansatt ID", "Fra", "Til", "Totalt (uten reise)", "Lunsj", "Reiselengde", "Arbeidstyper", "Kommentarer"];
const rad = (dato: string, kunde: string, prosjekt: string, nr: number | null, id: number, fra: string, totaltMin: number, lunsjMin: number, k = "") =>
  [dato, kunde, prosjekt, nr, null, "Jim Kato Flem", id, fra, "", totaltMin / 1440, lunsjMin / 1440, null, null, k];
const ark = [["N L AUSTNES AS"], ["01.11.2024 - 10.10.2026"], [], hode,
  rad("02.03.2026", "Siri Kjerstad", "Siri  Kjerstad Renovering", 6, 3, "08:00", 480, 30, "Bad"),
  rad("02.03.2026", "", "", null, 3, "16:30", 60, 0),
  rad("03.03.2026", "Harald Vågene", "Skifte bordkledning", 10857, 3, "23:00", 120, 0),
  rad("04.03.2026", "", "Ny", null, 3, "08:00", 0, 0),
  [null, null, null, null, null, null, null, null, null, 9999 / 1440]];

describe("svenn", () => {
  it("leser timelista og hopper over 0-timer og summeringsrad", () => {
    const { rader, tomme } = lesSvenn(ark);
    expect(tomme).toBe(1);
    expect(rader.map((r) => [r.dato, r.ansattnr, r.fra, r.arbeid, r.lunsj, r.nokkel])).toEqual([
      ["2026-03-02", "3", 480, 480, 30, "Siri Kjerstad Renovering#6"],
      ["2026-03-02", "3", 990, 60, 0, "#kunde:"],
      ["2026-03-03", "3", 1380, 120, 0, "Skifte bordkledning#10857"],
    ]);
  });
  it("til = fra + arbeid + lunsj, og holdes innenfor døgnet", () => {
    const r = importRader(lesSvenn(ark).rader);
    expect(r.map((x) => [x.f, x.t, x.l])).toEqual([["08:00", "16:30", 30], ["16:30", "17:30", 0], ["21:59", "23:59", 0]]);
  });
  it("foreslår lagret kobling, internt, eksisterende prosjekt eller nytt", () => {
    const pr = [{ id: "p186", visma_nr: 186, navn: "Siri Kjerstad Renovering" }] as Prosjekt[];
    const sp = svennProsjekter(lesSvenn(ark).rader);
    const f = (n: string, lagret = new Map()) => foreslaKobling(sp.find((p) => p.nokkel === n)!, pr, lagret, "N L Austnes AS");
    expect(f("Siri Kjerstad Renovering#6")).toMatchObject({ prosjekt_id: "p186", fakturerbar: true });
    expect(f("#kunde:")).toMatchObject({ prosjekt_id: null, ny_navn: null, fakturerbar: false });
    expect(f("Skifte bordkledning#10857")).toMatchObject({ prosjekt_id: null, ny_navn: "Skifte bordkledning – Harald Vågene" });
    expect(f("Skifte bordkledning#10857", new Map([["Skifte bordkledning#10857", { prosjekt_id: "x", fakturerbar: false }]]))).toMatchObject({ prosjekt_id: "x", fakturerbar: false });
  });
});

describe("svenn-arkiv", () => {
  it("leser manifest og filer (lagret og komprimert), og grupperer per prosjekt", async () => {
    const { readFileSync } = await import("node:fs");
    const { lesSvennArkiv, arkivProsjekter, svennBildetekst } = await import("../src/lib/svenn");
    const b = readFileSync("test/fixtures/svenn-arkiv.zip");
    const { manifest, les } = await lesSvennArkiv(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    expect(manifest.filer).toHaveLength(2);
    expect(Array.from((await les("filer/0001.jpg"))!.slice(0, 2))).toEqual([0xff, 0xd8]);
    expect((await les("filer/0002.pdf"))!.length).toBe(509);
    expect(arkivProsjekter(manifest.filer).map((p) => [p.navn, p.bilder, p.dokumenter])).toEqual([["Siri Kjerstad Renovering - siri extra", 1, 0], ["Siri Kjerstad Renovering", 0, 1]]);
    expect(svennBildetekst(manifest.filer[0])).toBe("Div. bilder · fra Svenn 10.02.2026");
  });
});
