import { describe, expect, it } from "vitest";
import { fargerIBilde, foreslaDrakt, draktVariabler, hjorneFarge, fjernBakgrunn, kontrast, rgb, type Rgb } from "../src/lib/drakt";

/** Lager et bilde: bakgrunn med et rektangel av en annen farge */
function bilde(w: number, h: number, bak: [number, number, number, number], felt?: { farge: [number, number, number, number]; andel: number }) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const inne = felt && x >= w * 0.2 && x < w * (0.2 + felt.andel) && y >= h * 0.3 && y < h * 0.7;
    px.set(inne ? felt!.farge : bak, i);
  }
  return px;
}

describe("drakt fra logo", () => {
  it("blå logo med hvit tekst: blått bærer, ingen annen farge gir ByggLogg-gult", () => {
    const px = bilde(100, 100, [11, 31, 191, 255], { farge: [255, 255, 255, 255], andel: 0.6 });
    const d = foreslaDrakt(fargerIBilde(px));
    expect(kontrast(rgb(d.hoved), [11, 31, 191])).toBeLessThan(1.2);
    expect(d.aksent).toBe("#FFCD00");
  });
  it("lys grønn hovedfarge mørknes så hvit tekst kan leses, rød blir aksent", () => {
    const px = bilde(100, 100, [120, 220, 120, 255], { farge: [220, 30, 30, 255], andel: 0.3 });
    const d = foreslaDrakt(fargerIBilde(px));
    expect(kontrast(rgb(d.hoved), [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
    const [r, g, b] = rgb(d.aksent);
    expect(r).toBeGreaterThan(180); expect(g).toBeLessThan(80); expect(b).toBeLessThan(80);
  });
  it("svart logo på gjennomsiktig bunn gir mørk drakt", () => {
    const px = bilde(100, 100, [0, 0, 0, 0], { farge: [10, 10, 10, 255], andel: 0.5 });
    const d = foreslaDrakt(fargerIBilde(px));
    expect(d.hoved).toBe("#0A0A0A");
  });
  it("variablene har aksent i tommestokken og blekk som kan leses på aksenten", () => {
    const v = draktVariabler({ hoved: "#0A1EBE", aksent: "#FFCD00" });
    expect(v["--stokk"]).toContain("#FFCD00");
    expect(v["--drakt-aksent-blekk"]).not.toBe("#FFFFFF");
    expect(v["--navy-2"]).toBe("#0A1EBE");
  });
  it("finner ensfarget bakgrunn og fjerner den", () => {
    const px = bilde(40, 40, [11, 31, 191, 255], { farge: [255, 255, 255, 255], andel: 0.5 });
    const bak = hjorneFarge(px, 40, 40) as Rgb;
    expect(bak).toEqual([11, 31, 191]);
    const lys = fjernBakgrunn(px, bak);
    expect(lys).toBeGreaterThan(0.9);
    expect(px[3]).toBe(0);
    expect(hjorneFarge(bilde(40, 40, [0, 0, 0, 0]), 40, 40)).toBeNull();
  });
});
