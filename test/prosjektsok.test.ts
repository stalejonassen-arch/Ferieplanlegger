import { describe, expect, it } from "vitest";
import { sokProsjekter } from "../src/lib/prosjektsok";
import type { Prosjekt } from "../src/lib/timer";

const p = (id: string, visma_nr: number | null, navn: string, kunde_id: string | null, adresse = ""): Prosjekt =>
  ({ id, visma_nr, navn, kunde_id, adresse, estimert_timer: null, start: null, slutt: null, aktiv: true });
const prosjekter = [
  p("a", 2310, "Renovere bad", "k1", "Storgata 5, Brattvåg"),
  p("b", 2231, "Nytt tak garasje", "k2", "Lepsøyvegen 12"),
  p("c", 1923, "Tilbygg Harøya", "k3", "Øvsteremma 9"),
  p("d", null, "Badstue", null),
];
const kunder = [{ id: "k1", navn: "Ola Nordmann" }, { id: "k2", navn: "Kari Hansen" }, { id: "k3", navn: "John Myklebust" }];
const ider = (s: string) => sokProsjekter(prosjekter, kunder, s).map((x) => x.id);

describe("prosjektsøk", () => {
  it("viser alle uten søk", () => expect(ider("  ")).toEqual(["a", "b", "c", "d"]));
  it("finner på nummer, og nummer som starter likt kommer først", () => {
    expect(ider("2310")).toEqual(["a"]);
    expect(ider("23")[0]).toBe("a");
    expect(ider("22")).toEqual(["b"]);
  });
  it("finner på kunde og adresse", () => {
    expect(ider("nordmann")).toEqual(["a"]);
    expect(ider("lepsøy")).toEqual(["b"]);
    expect(ider("ØVSTEREMMA")).toEqual(["c"]);
  });
  it("alle ordene må passe", () => {
    expect(ider("bad ola")).toEqual(["a"]);
    expect(ider("bad kari")).toEqual([]);
  });
  it("navn som starter med søket kommer før treff midt i", () => expect(ider("bad")).toEqual(["d", "a"]));
});
