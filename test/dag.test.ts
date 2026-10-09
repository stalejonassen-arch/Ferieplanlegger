import { describe, expect, it } from "vitest";
import { dagHendelser, prosjekterIDag, klokke } from "../src/lib/dag";

const ts = (dato: string, hm: string) => new Date(`${dato}T${hm}:00`).toISOString(); // lokal tid
const time = (id: string, p: string | null, fra: string, til: string, timer: number, ansatt = "a") =>
  ({ id, ansatt_id: ansatt, prosjekt_id: p, dato: "2026-10-12", fra, til, lunsj_min: 0, timer, lunsj_unntak: false, km: 0, reisetid: 0, beskrivelse: "", status: "levert" as const });

describe("dagslogg", () => {
  const d = {
    timer: [time("t2", "P2", "10:00", "15:00", 5), time("t1", "P1", "07:00", "09:30", 2.5), time("t3", "P1", "08:00", "12:00", 4, "b")],
    dagbok: [
      { id: "d1", prosjekt_id: "P1", ansatt_id: "a", dato: "2026-10-12", vaer: "Regn", tekst: "Lektet", hindringer: "", opprettet: ts("2026-10-12", "09:20") },
      { id: "d2", prosjekt_id: "P2", ansatt_id: "a", dato: "2026-10-12", vaer: "", tekst: "Skrevet dagen etter", hindringer: "", opprettet: ts("2026-10-13", "07:00") },
    ],
    bilder: [
      { id: "b1", prosjekt_id: "P2", avvik_id: null, ansatt_id: "a", sti: "1", tekst: "", opprettet: ts("2026-10-12", "11:05") },
      { id: "b2", prosjekt_id: "P2", avvik_id: null, ansatt_id: "a", sti: "2", tekst: "", opprettet: ts("2026-10-12", "11:40") },
      { id: "b3", prosjekt_id: "P2", avvik_id: null, ansatt_id: "a", sti: "3", tekst: "", opprettet: ts("2026-10-11", "11:40") },
    ],
    avvik: [], tillegg: [],
  };

  it("samler dagen i klokkeslett-rekkefølge på tvers av prosjekter", () => {
    const h = dagHendelser(d as any, "2026-10-12", new Set(["a"]));
    expect(h.map((x) => `${x.type}@${x.tid}`)).toEqual(["timer@07:00", "dagbok@09:20", "timer@10:00", "bilder@11:05", "dagbok@23:59"]);
    const b = h.find((x) => x.type === "bilder") as any;
    expect(b.bilder.map((x: any) => x.id)).toEqual(["b1", "b2"]);
    expect((h[4] as any).senere).toBe(true);
  });

  it("prosjektene i den rekkefølgen de ble besøkt, med timer", () => {
    const p = prosjekterIDag(dagHendelser(d as any, "2026-10-12", new Set(["a"])));
    expect(p.map((x) => [x.prosjekt_id, x.timer, x.fra, x.til])).toEqual([["P1", 2.5, "07:00", "09:30"], ["P2", 5, "10:00", "15:00"]]);
  });

  it("hele laget tar med alle valgte ansatte", () => {
    expect(dagHendelser(d as any, "2026-10-12", new Set(["a", "b"])).filter((x) => x.type === "timer")).toHaveLength(3);
    expect(klokke(ts("2026-10-12", "07:05"))).toBe("07:05");
  });
});
