/**
 * Firmafarger («drakt») laget av bedriftens logo.
 * Hovedfargen bærer toppfeltet og knappene, aksentfargen tar plassen til tommestokk-gult.
 * Rene funksjoner øverst (testes), lesing av bildefil nederst (trenger nettleser).
 */
export interface Drakt { hoved: string; aksent: string }

export type Rgb = [number, number, number];

const BYGGLOGG_GUL = "#FFCD00";
const BYGGLOGG_BLA = "#0A1EBE";

export const hex = (c: Rgb) => "#" + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("").toUpperCase();
export const rgb = (h: string): Rgb => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const gyldigFarge = (h: string) => /^#[0-9a-f]{6}$/i.test(h.trim());

const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminans = (c: Rgb) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export const kontrast = (a: Rgb, b: Rgb) => { const x = luminans(a), y = luminans(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const bland = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Fargetone (0–360), metning (0–1) og lyshet (0–1) */
export function hsl(c: Rgb): [number, number, number] {
  const [r, g, b] = c.map((x) => x / 255) as Rgb;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
const toneAvstand = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const HVIT: Rgb = [255, 255, 255];
const BLEKK: Rgb = [26, 20, 0];

/** Mørkner fargen til hvit tekst kan leses på den (WCAG 4.5) */
export function morkTilHvitTekst(c: Rgb): Rgb {
  let x = c;
  for (let i = 0; i < 40 && kontrast(x, HVIT) < 4.5; i++) x = bland(x, [0, 0, 0], 0.06);
  return x;
}
/** Lysner fargen til den kan leses på mørk bakgrunn (mørk modus) */
export function lysTilMorkBakgrunn(c: Rgb, bak: Rgb = [20, 27, 56]): Rgb {
  let x = c;
  for (let i = 0; i < 40 && kontrast(x, bak) < 4.5; i++) x = bland(x, HVIT, 0.07);
  return x;
}
/** Hvit eller mørk skrift på en farge, den som gir best kontrast */
export const blekkPaa = (c: Rgb): Rgb => (kontrast(c, HVIT) >= kontrast(c, BLEKK) ? HVIT : BLEKK);

export interface Kandidat { farge: Rgb; andel: number; metning: number }

/**
 * Finner fargene i et bilde (RGBA-piksler). Hvitt, svart, grått og gjennomsiktig regnes ikke som farger,
 * men tas med i `noytral` så en svart logo får en mørk drakt.
 */
export function fargerIBilde(px: Uint8ClampedArray | number[]): { farger: Kandidat[]; noytral: Rgb | null } {
  const botter = new Map<number, { n: number; r: number; g: number; b: number }>();
  let tot = 0, morkN = 0, morkSum: Rgb = [0, 0, 0];
  for (let i = 0; i + 3 < px.length; i += 4) {
    const a = px[i + 3]!;
    if (a < 128) continue;
    const c: Rgb = [px[i]!, px[i + 1]!, px[i + 2]!];
    tot++;
    const [, s, l] = hsl(c);
    if (l > 0.93 || (s < 0.15 && l > 0.25)) continue;          // hvitt og lysegrått
    if (l < 0.08 || s < 0.15) { morkN++; morkSum = [morkSum[0] + c[0], morkSum[1] + c[1], morkSum[2] + c[2]]; continue; }
    const k = ((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4);
    const bt = botter.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    bt.n++; bt.r += c[0]; bt.g += c[1]; bt.b += c[2];
    botter.set(k, bt);
  }
  // Slå sammen nabobøtter til farger: grådig fra den største, alt som ligner (avstand < 48) går inn i den
  const liste = [...botter.values()].map((b) => ({ n: b.n, c: [b.r / b.n, b.g / b.n, b.b / b.n] as Rgb })).sort((a, b) => b.n - a.n);
  const farger: { n: number; sum: Rgb }[] = [];
  for (const b of liste) {
    const f = farger.find((x) => { const m: Rgb = [x.sum[0] / x.n, x.sum[1] / x.n, x.sum[2] / x.n]; return Math.hypot(m[0] - b.c[0], m[1] - b.c[1], m[2] - b.c[2]) < 48; });
    if (f) { f.n += b.n; f.sum = [f.sum[0] + b.c[0] * b.n, f.sum[1] + b.c[1] * b.n, f.sum[2] + b.c[2] * b.n]; }
    else farger.push({ n: b.n, sum: [b.c[0] * b.n, b.c[1] * b.n, b.c[2] * b.n] });
  }
  const ut = farger
    .map((f) => { const c: Rgb = [f.sum[0] / f.n, f.sum[1] / f.n, f.sum[2] / f.n]; return { farge: c.map(Math.round) as Rgb, andel: tot ? f.n / tot : 0, metning: hsl(c)[1] }; })
    .filter((k) => k.andel >= 0.004)
    .sort((a, b) => b.andel - a.andel);
  const noytral = tot && morkN / tot > 0.02 ? (morkSum.map((x) => Math.round(x / morkN)) as Rgb) : null;
  return { farger: ut, noytral };
}

/** Foreslår drakt: mest brukte farge blir hovedfarge, den mest ulike tydelige fargen blir aksent */
export function foreslaDrakt(f: { farger: Kandidat[]; noytral: Rgb | null }): Drakt {
  const [forste, ...resten] = f.farger;
  const hovedR: Rgb = forste ? forste.farge : f.noytral ?? rgb(BYGGLOGG_BLA);
  const hoved = morkTilHvitTekst(hovedR);
  const tone = hsl(hovedR)[0];
  const aksent = (forste ? resten : f.farger)
    .filter((k) => k.metning > 0.35 && (!forste || toneAvstand(hsl(k.farge)[0], tone) > 35))
    .sort((a, b) => b.andel * (0.5 + b.metning) - a.andel * (0.5 + a.metning))[0];
  // Ingen annen farge i logoen: ByggLogg-gult, med mindre hovedfargen selv er gul/oransje
  const reserve = forste && toneAvstand(tone, 48) < 30 ? "#FFFFFF" : BYGGLOGG_GUL;
  return { hoved: hex(hoved), aksent: aksent ? hex(aksent.farge) : reserve };
}

/** CSS-variabler for temaet «egen» */
export function draktVariabler(d: Drakt): Record<string, string> {
  const h = morkTilHvitTekst(rgb(d.hoved)), a = rgb(d.aksent);
  const blekk = blekkPaa(a);
  const rgba = (c: Rgb, o: number) => `rgba(${c.map(Math.round).join(", ")}, ${o})`;
  return {
    "--drakt-hoved": hex(h),
    "--drakt-hoved-lys": hex(lysTilMorkBakgrunn(rgb(d.hoved))),
    "--drakt-aksent": hex(a),
    "--drakt-aksent-blekk": hex(blekk),
    "--drakt-aksent-tekst": aksentPaaHvit(d),
    "--drakt-glod": rgba(a, 0.22),
    "--drakt-skygge": rgba(h, 0.6),
    "--drakt-dyp": hex(bland(h, [0, 0, 0], 0.62)),
    "--navy": hex(bland(h, [0, 0, 0], 0.35)),
    "--navy-2": hex(h),
    "--bf-blue": hex(h),
    "--bf-blue-dark": hex(bland(h, [0, 0, 0], 0.3)),
    "--bf-yellow": hex(a),
    "--stokk": `repeating-linear-gradient(90deg, ${hex(blekk)} 0 2px, transparent 2px 50px) left top / 100% 9px no-repeat, repeating-linear-gradient(90deg, ${hex(blekk)} 0 1px, transparent 1px 10px) left top / 100% 5px no-repeat, ${hex(a)}`,
  };
}

/** Farge til tekst/streker på hvit bakgrunn laget av aksenten (gult på hvitt er uleselig) */
export function aksentPaaHvit(d: Drakt): string {
  let x = rgb(d.aksent);
  for (let i = 0; i < 40 && kontrast(x, HVIT) < 3; i++) x = bland(x, [0, 0, 0], 0.06);
  return hex(x);
}

// ---------- Lesing av logo i nettleseren ----------

export interface LestLogo { logo: string; logoMork: string | null; drakt: Drakt }

const MAKS = 360;
const MAKS_TEGN = 380_000;

function lastBilde(fil: Blob): Promise<HTMLImageElement> {
  return new Promise((ok, feil) => {
    const url = URL.createObjectURL(fil);
    const img = new Image();
    img.onload = () => { ok(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); feil(new Error("Klarte ikke å lese bildet. Bruk PNG, JPG, WebP eller SVG.")); };
    img.src = url;
  });
}

function tilDataUrl(c: HTMLCanvasElement, alfa: boolean): string {
  const w = c.toDataURL("image/webp", 0.92);
  if (w.startsWith("data:image/webp")) return w;
  return alfa ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.9);
}

/** Bakgrunnsfargen hvis alle fire hjørner har samme, heldekkende farge */
export function hjorneFarge(px: Uint8ClampedArray, w: number, h: number): Rgb | null {
  const pr = (x: number, y: number) => { const i = (y * w + x) * 4; return [px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!]; };
  const p = [pr(1, 1), pr(w - 2, 1), pr(1, h - 2), pr(w - 2, h - 2)];
  if (p.some((x) => x[3]! < 250)) return null;
  const f = p[0]!;
  if (p.some((x) => Math.hypot(x[0]! - f[0]!, x[1]! - f[1]!, x[2]! - f[2]!) > 30)) return null;
  return [f[0]!, f[1]!, f[2]!];
}

/**
 * Fjerner bakgrunnsfargen (gjør den gjennomsiktig, myke kanter beholdes) og returnerer
 * gjennomsnittlig lyshet på det som blir igjen.
 */
export function fjernBakgrunn(px: Uint8ClampedArray, bak: Rgb): number {
  let sum = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! < 10) continue;
    const c: Rgb = [px[i]!, px[i + 1]!, px[i + 2]!];
    const d = Math.hypot(c[0] - bak[0], c[1] - bak[1], c[2] - bak[2]);
    const a = Math.max(0, Math.min(1, (d - 24) / 90));
    if (a <= 0) { px[i + 3] = 0; continue; }
    // Fjern bakgrunnens bidrag fra kantpikslene
    for (let k = 0; k < 3; k++) px[i + k] = Math.max(0, Math.min(255, (c[k]! - bak[k]! * (1 - a)) / a));
    px[i + 3] = Math.round(px[i + 3]! * a);
    if (a > 0.6) { sum += luminans([px[i]!, px[i + 1]!, px[i + 2]!]); n++; }
  }
  return n ? sum / n : 0;
}

/** Leser en opplastet logo: nedskalert kopi, variant for mørk bakgrunn og foreslått drakt */
export async function lesLogo(fil: Blob): Promise<LestLogo> {
  const img = await lastBilde(fil);
  let w = img.naturalWidth || 512, h = img.naturalHeight || 512;
  if (!w || !h) throw new Error("Bildet er tomt.");
  for (let skala = Math.min(1, MAKS / Math.max(w, h)); ; skala *= 0.8) {
    const cw = Math.max(1, Math.round(w * skala)), ch = Math.max(1, Math.round(h * skala));
    const c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, cw, ch);
    const data = g.getImageData(0, 0, cw, ch);
    const harAlfa = data.data.some((v, i) => i % 4 === 3 && v < 250);
    const logo = tilDataUrl(c, harAlfa);
    const drakt = foreslaDrakt(fargerIBilde(data.data));

    // Variant for mørkt toppfelt: fjern ensfarget bakgrunn, behold bare hvis det som er igjen er lyst
    let logoMork: string | null = null;
    const bak = hjorneFarge(data.data, cw, ch);
    const kopi = new ImageData(new Uint8ClampedArray(data.data), cw, ch);
    const lyshet = bak ? fjernBakgrunn(kopi.data, bak) : harAlfa ? fargerLyshet(kopi.data) : 0;
    if (lyshet > 0.45) {
      const ramme = innholdsRamme(kopi.data, cw, ch);
      if (ramme) {
        const k = document.createElement("canvas"); k.width = ramme.w; k.height = ramme.h;
        const t = document.createElement("canvas"); t.width = cw; t.height = ch;
        t.getContext("2d")!.putImageData(kopi, 0, 0);
        k.getContext("2d")!.drawImage(t, ramme.x, ramme.y, ramme.w, ramme.h, 0, 0, ramme.w, ramme.h);
        logoMork = tilDataUrl(k, true);
      }
    }
    if (logo.length + (logoMork?.length ?? 0) <= MAKS_TEGN || cw < 48) {
      return { logo, logoMork, drakt };
    }
  }
}

function fargerLyshet(px: Uint8ClampedArray): number {
  let sum = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3]! > 150) { sum += luminans([px[i]!, px[i + 1]!, px[i + 2]!]); n++; }
  return n ? sum / n : 0;
}

function innholdsRamme(px: Uint8ClampedArray, w: number, h: number) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3]! > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const m = 2;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Logoen som PNG-bytes (for PDF-rapporter, som ikke kan WebP). Null hvis den ikke kan leses. */
export async function logoSomPng(dataUrl: string): Promise<Uint8Array | null> {
  try {
    const img = await new Promise<HTMLImageElement>((ok, feil) => { const i = new Image(); i.onload = () => ok(i); i.onerror = feil; i.src = dataUrl; });
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    const b64 = c.toDataURL("image/png").split(",")[1] ?? "";
    return Uint8Array.from(atob(b64), (x) => x.charCodeAt(0));
  } catch { return null; }
}
