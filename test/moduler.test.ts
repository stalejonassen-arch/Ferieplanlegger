import { describe, expect, it } from "vitest";
import { AV_SOM_STANDARD, MODULER, bruker, settModul } from "../src/lib/moduler";

describe("moduler", () => {
  it("vanlige deler er på til leder slår dem av", () => {
    expect(bruker({ modulerAv: [] }, "chat")).toBe(true);
    expect(bruker({ modulerAv: ["chat"] }, "chat")).toBe(false);
    expect(bruker({}, "avvik")).toBe(true);
  });

  it("Kontrakt er av som standard og slås på per bedrift", () => {
    expect(AV_SOM_STANDARD).toContain("kontrakt");
    expect(bruker({ modulerAv: [] }, "kontrakt")).toBe(false);
    expect(bruker({}, "kontrakt")).toBe(false);
    const paa = settModul([], "kontrakt", true);
    expect(paa).toEqual(["kontraktpaa"]);
    expect(bruker({ modulerAv: paa }, "kontrakt")).toBe(true);
    expect(settModul(paa, "kontrakt", false)).toEqual([]);
    // Står den både på og av, vinner av
    expect(bruker({ modulerAv: ["kontrakt", "kontraktpaa"] }, "kontrakt")).toBe(false);
  });

  it("settModul rører ikke de andre delene", () => {
    expect(settModul(["vaer"], "chat", false)).toEqual(["chat", "vaer"]);
    expect(settModul(["chat", "vaer"], "chat", true)).toEqual(["vaer"]);
    expect(settModul(["vaer"], "kontrakt", true)).toEqual(["kontraktpaa", "vaer"]);
  });

  it("merket for på passer i databasen (lagre_moduler godtar ^[a-z]{2,20}$)", () => {
    for (const m of AV_SOM_STANDARD) expect(`${m}paa`).toMatch(/^[a-z]{2,20}$/);
    expect(MODULER.map((m) => m.id)).toContain("kontrakt");
  });
});
