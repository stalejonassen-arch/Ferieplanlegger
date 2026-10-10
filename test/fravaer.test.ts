import { describe, expect, it } from "vitest";
import { arbeidsdager, arbeidsgiverperiode, egenmeldinger, kalenderdager, syktBarnDager, type Fravaer } from "../src/lib/fravaer";

const f = (type: Fravaer["type"], fra: string, til: string, ansatt = "a"): Fravaer => ({ id: fra + type, ansatt_id: ansatt, type, fra, til, grad: 100, merknad: "", opprettet: "" });

describe("sykefravær", () => {
  it("teller kalenderdager og arbeidsdager", () => {
    expect(kalenderdager("2026-10-09", "2026-10-11")).toBe(3);
    expect(arbeidsdager("2026-10-09", "2026-10-12")).toBe(2); // fre + man
    expect(arbeidsdager("2026-12-24", "2026-12-28")).toBe(2); // 24. og 28. (25./26. er helligdager, 27. søndag)
  });
  it("egenmeldinger siste 12 måneder", () => {
    const l = [f("egenmelding", "2025-09-01", "2025-09-02"), f("egenmelding", "2026-02-02", "2026-02-04"), f("egenmelding", "2026-09-07", "2026-09-07"), f("sykmelding", "2026-05-04", "2026-05-08")];
    expect(egenmeldinger(l, "a", "2026-10-10")).toEqual({ ganger: 2, dager: 4 });
  });
  it("sykt barn teller arbeidsdager i året", () => {
    expect(syktBarnDager([f("sykt_barn", "2026-10-08", "2026-10-12")], "a", 2026)).toBe(3);
  });
  it("arbeidsgiverperioden: 16 dager, fravær tett i tett regnes sammen", () => {
    const l = [f("egenmelding", "2026-09-01", "2026-09-03"), f("sykmelding", "2026-09-10", "2026-09-30")];
    const p = arbeidsgiverperiode(l, "a")!;
    expect(p.dager).toBe(16);
    expect(p.navFra).toBe("2026-09-23"); // 3 dager + 13 dager fra 10.09 → dag 17 er 23.09
    expect(arbeidsgiverperiode([f("egenmelding", "2026-01-05", "2026-01-06"), f("egenmelding", "2026-03-02", "2026-03-03")], "a")).toMatchObject({ dager: 2, navFra: null, fra: "2026-03-02" });
  });
});
