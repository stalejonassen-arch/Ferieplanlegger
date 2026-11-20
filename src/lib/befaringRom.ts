// Befaring rom for rom: mål per rom (lengde, bredde, takhøyde, dører og vinduer) og mengdene som følger av dem –
// gulv, list, veggflate, tak og listverk rundt åpninger. Mengdene går videre til tilbudet og rapporten.
// Alle mål lagres i meter.

export interface Aapning { antall: number; b: number; h: number }

export interface BefaringRom {
  id: string;
  navn: string;
  lengde?: number | null;
  bredde?: number | null;
  hoyde?: number | null;
  dorer?: Aapning[];
  vinduer?: Aapning[];
  /** Hva som skal gjøres i rommet, og ting å huske */
  notat?: string;
}

export interface Mengder {
  gulv: number;      // m²
  tak: number;       // m²
  omkrets: number;   // lm
  list: number;      // lm gulvlist (omkrets minus dører)
  veggBrutto: number; // m²
  veggNetto: number; // m² (minus dører og vinduer)
  dorer: number;     // stk
  vinduer: number;   // stk
  listverk: number;  // lm listverk rundt dører (to sider + topp) og vinduer (rundt)
}

export const STANDARD_DOR: Aapning = { antall: 1, b: 0.9, h: 2.1 };
export const STANDARD_VINDU: Aapning = { antall: 1, b: 1.2, h: 1.2 };
export const STANDARD_ROM = ["Stue", "Kjøkken", "Soverom", "Bad", "Gang", "Vaskerom", "Bod", "Kontor", "Loft", "Kjeller"];

const r2 = (x: number) => Math.round(x * 100) / 100;
const pos = (x: unknown) => (typeof x === "number" && isFinite(x) && x > 0 ? x : 0);

/**
 * Leser et mål skrevet av en håndverker: «4,2», «4.2 m», «420 cm», «4200 mm», «420» (tolkes som cm når det er over 30).
 * Gir meter, eller null når det ikke er et tall.
 */
export function lesMaal(t: string | number | null | undefined): number | null {
  if (t == null) return null;
  if (typeof t === "number") t = String(t);
  const m = t.trim().toLowerCase().replace(/\s+/g, "").match(/^(\d+(?:[.,]\d+)?)(mm|cm|m)?$/);
  if (!m) return null;
  let v = Number(m[1].replace(",", "."));
  if (!(v > 0)) return null;
  if (m[2] === "mm") v /= 1000;
  else if (m[2] === "cm") v /= 100;
  else if (!m[2] && v > 30) v = v >= 1000 ? v / 1000 : v / 100;
  return Math.round(v * 1000) / 1000;
}

/** «120x140», «1,2 × 1,4», «120 ganger 140» → bredde og høyde i meter */
export function lesAapning(t: string): { b: number; h: number } | null {
  const deler = t.toLowerCase().split(/\s*(?:x|×|\*|ganger)\s*/);
  if (deler.length !== 2) return null;
  const b = lesMaal(deler[0]), h = lesMaal(deler[1]);
  return b && h ? { b, h } : null;
}

/** Mål som tekst: 4,2 (uten enhet), eller tom streng */
export const visMaal = (m?: number | null) => (m ? String(r2(m)).replace(".", ",") : "");
/** Tall med komma og én eller to desimaler */
export const tall = (x: number, des = 1) => x.toLocaleString("nb-NO", { maximumFractionDigits: des, minimumFractionDigits: 0 });

/** Mengdene i ett rom. Mangler et mål, blir det som avhenger av det 0. */
export function romMengder(r: BefaringRom): Mengder {
  const L = pos(r.lengde), B = pos(r.bredde), H = pos(r.hoyde);
  const dorer = (r.dorer ?? []).filter((a) => a.antall > 0);
  const vinduer = (r.vinduer ?? []).filter((a) => a.antall > 0);
  const gulv = L * B;
  const omkrets = L && B ? 2 * (L + B) : 0;
  const dorBredde = dorer.reduce((s, a) => s + a.antall * pos(a.b), 0);
  const aapninger = [...dorer, ...vinduer].reduce((s, a) => s + a.antall * pos(a.b) * pos(a.h), 0);
  const veggBrutto = omkrets * H;
  const listverk = dorer.reduce((s, a) => s + a.antall * (2 * pos(a.h) + pos(a.b)), 0)
    + vinduer.reduce((s, a) => s + a.antall * 2 * (pos(a.b) + pos(a.h)), 0);
  return {
    gulv: r2(gulv), tak: r2(gulv), omkrets: r2(omkrets),
    list: r2(Math.max(0, omkrets - dorBredde)),
    veggBrutto: r2(veggBrutto), veggNetto: r2(veggBrutto ? Math.max(0, veggBrutto - aapninger) : 0),
    dorer: dorer.reduce((s, a) => s + a.antall, 0), vinduer: vinduer.reduce((s, a) => s + a.antall, 0),
    listverk: r2(listverk),
  };
}

/** Summen for alle rommene */
export function sumMengder(rom: BefaringRom[]): Mengder {
  const s: Mengder = { gulv: 0, tak: 0, omkrets: 0, list: 0, veggBrutto: 0, veggNetto: 0, dorer: 0, vinduer: 0, listverk: 0 };
  for (const r of rom) {
    const m = romMengder(r);
    for (const k of Object.keys(s) as (keyof Mengder)[]) s[k] += m[k];
  }
  for (const k of Object.keys(s) as (keyof Mengder)[]) s[k] = r2(s[k]);
  return s;
}

/** Linjer for visning, tilbud og rapport. Tomme mengder tas ikke med. */
export function mengdeLinjer(m: Mengder): [string, string][] {
  const ut: [string, string | false][] = [
    ["Gulv", m.gulv > 0 && `${tall(m.gulv)} m²`],
    ["Gulvlist", m.list > 0 && `${tall(m.list)} lm`],
    ["Vegg (netto)", m.veggNetto > 0 && `${tall(m.veggNetto)} m²`],
    ["Tak", m.tak > 0 && `${tall(m.tak)} m²`],
    ["Dører", m.dorer > 0 && `${m.dorer} stk`],
    ["Vinduer", m.vinduer > 0 && `${m.vinduer} stk`],
    ["Listverk rundt dører/vinduer", m.listverk > 0 && `${tall(m.listverk)} lm`],
  ];
  return ut.filter((x): x is [string, string] => !!x[1]);
}

/** Romets mål som kort tekst: «4,2 × 3,1 m, takhøyde 2,4 m · 1 dør · 2 vinduer 120×140» */
export function romMaalTekst(r: BefaringRom): string {
  const deler: string[] = [];
  if (r.lengde && r.bredde) deler.push(`${visMaal(r.lengde)} × ${visMaal(r.bredde)} m`);
  else if (r.lengde || r.bredde) deler.push(`${visMaal(r.lengde || r.bredde)} m`);
  if (r.hoyde) deler.push(`takhøyde ${visMaal(r.hoyde)} m`);
  const cm = (x: number) => Math.round(x * 100);
  const aap = (liste: Aapning[] | undefined, en: string, flere: string) => (liste ?? []).filter((a) => a.antall > 0)
    .map((a) => `${a.antall} ${a.antall === 1 ? en : flere} ${cm(a.b)}×${cm(a.h)}`);
  return [deler.join(", "), ...aap(r.dorer, "dør", "dører"), ...aap(r.vinduer, "vindu", "vinduer")].filter(Boolean).join(" · ");
}

/** Mengdelista som tekst til tilbudet (kort, beskrivelsen har plass til 2000 tegn) */
export function mengdeTekst(rom: BefaringRom[]): string {
  const med = rom.filter((r) => r.navn.trim() && (r.lengde || r.bredde || r.dorer?.length || r.vinduer?.length));
  if (!med.length) return "";
  const linjer = med.map((r) => {
    const m = mengdeLinjer(romMengder(r)).filter(([k]) => k !== "Tak").map(([k, v]) => `${k.toLowerCase()} ${v}`);
    return `${r.navn.trim()}: ${romMaalTekst(r)}${m.length ? ` – ${m.join(", ")}` : ""}`;
  });
  const sum = mengdeLinjer(sumMengder(med)).map(([k, v]) => `${k} ${v}`).join(", ");
  return [`Rom og mål:`, ...linjer, med.length > 1 && sum ? `Totalt: ${sum}` : ""].filter(Boolean).join("\n");
}

const nyId = () => Math.random().toString(36).slice(2, 10);
export const nyttRom = (navn = ""): BefaringRom => ({ id: nyId(), navn, lengde: null, bredde: null, hoyde: null, dorer: [], vinduer: [], notat: "" });

/** Det KI leser ut av tale og bilder for ett rom (mål i meter) */
export interface KiRom {
  navn?: string; lengde?: number | null; bredde?: number | null; hoyde?: number | null;
  dorer?: { antall?: number; bredde?: number; hoyde?: number }[];
  vinduer?: { antall?: number; bredde?: number; hoyde?: number }[];
  notat?: string;
}

const kiAapning = (l: KiRom["dorer"], std: Aapning): Aapning[] => (l ?? [])
  .map((a) => ({ antall: Math.max(1, Math.round(pos(a.antall) || 1)), b: lesMaal(a.bredde ?? null) ?? std.b, h: lesMaal(a.hoyde ?? null) ?? std.h }))
  .filter((a) => a.antall <= 50);

/**
 * Fletter rommene KI fant inn i de som finnes. Rom med samme navn fylles bare der feltet er tomt (det håndverkeren
 * har skrevet står), nye rom legges til. Gir de nye rommene og hvor mange som ble endret eller lagt til.
 */
export function flettKiRom(rom: BefaringRom[], ki: KiRom[]): { rom: BefaringRom[]; endret: number } {
  const ut = rom.map((r) => ({ ...r }));
  let endret = 0;
  for (const k of ki) {
    const navn = (k.navn ?? "").trim().slice(0, 80);
    if (!navn) continue;
    const L = lesMaal(k.lengde ?? null), B = lesMaal(k.bredde ?? null), H = lesMaal(k.hoyde ?? null);
    const dorer = kiAapning(k.dorer, STANDARD_DOR), vinduer = kiAapning(k.vinduer, STANDARD_VINDU);
    const notat = (k.notat ?? "").trim().slice(0, 1000);
    const g = ut.find((r) => r.navn.trim().toLowerCase() === navn.toLowerCase());
    if (!g) {
      ut.push({ ...nyttRom(navn), lengde: L, bredde: B, hoyde: H, dorer, vinduer, notat });
      endret++;
      continue;
    }
    const foer = JSON.stringify(g);
    if (!g.lengde && L) g.lengde = L;
    if (!g.bredde && B) g.bredde = B;
    if (!g.hoyde && H) g.hoyde = H;
    if (!g.dorer?.length && dorer.length) g.dorer = dorer;
    if (!g.vinduer?.length && vinduer.length) g.vinduer = vinduer;
    if (notat && !(g.notat ?? "").includes(notat)) g.notat = [g.notat?.trim(), notat].filter(Boolean).join("\n").slice(0, 1000);
    if (JSON.stringify(g) !== foer) endret++;
  }
  return { rom: ut.slice(0, 60), endret };
}

/** Rensker rommene før lagring: navn påkrevd, gyldige tall, maks 60 rom */
export function rensRom(rom: BefaringRom[]): BefaringRom[] {
  const m = (x: unknown) => (typeof x === "number" && isFinite(x) && x > 0 && x < 1000 ? r2(x) : null);
  const aap = (l?: Aapning[]) => (l ?? []).map((a) => ({ antall: Math.min(50, Math.max(0, Math.round(a.antall || 0))), b: m(a.b) ?? 0, h: m(a.h) ?? 0 })).filter((a) => a.antall > 0 && a.b > 0 && a.h > 0);
  return rom.filter((r) => r.navn.trim()).slice(0, 60).map((r) => ({
    id: r.id || nyId(), navn: r.navn.trim().slice(0, 80), lengde: m(r.lengde), bredde: m(r.bredde), hoyde: m(r.hoyde),
    dorer: aap(r.dorer), vinduer: aap(r.vinduer), notat: (r.notat ?? "").trim().slice(0, 1000),
  }));
}

/**
 * Romskisse: rektangel i riktig forhold med dører markert på nedre vegg og vinduer på øvre.
 * Gir figurer i et koordinatsystem 0..bredde × 0..høyde (y nedover), brukt både i appen (SVG) og i PDF-en.
 */
export function romSkisse(r: BefaringRom, maksB: number, maksH: number) {
  const L = pos(r.lengde), B = pos(r.bredde);
  if (!L || !B) return null;
  const s = Math.min(maksB / L, maksH / B);
  const w = L * s, h = B * s;
  const fordel = (liste: Aapning[], y: number) => {
    const alle = liste.flatMap((a) => Array.from({ length: Math.min(a.antall, 12) }, () => a));
    const sum = alle.reduce((x, a) => x + a.b * s, 0);
    const luft = Math.max(0, (w - sum) / (alle.length + 1));
    let x = luft;
    return alle.map((a) => { const bit = { x, y, w: Math.min(a.b * s, w) }; x += a.b * s + luft; return bit; });
  };
  return { w, h, dorer: fordel(r.dorer ?? [], h), vinduer: fordel(r.vinduer ?? [], 0) };
}
