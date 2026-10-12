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
