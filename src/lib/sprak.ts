// Språk i brukerflaten. Norsk er grunnspråket; for polsk, engelsk og litauisk oversettes teksten på skjermen fortløpende
// (tekstnoder og placeholder/title/aria-label), slik at alle visninger får det uten å endre hver komponent.
// Det de ansatte selv skriver (prosjektnavn, kommentarer o.l.) treffer ikke ordlista og står urørt.
import { EN_MALER, EN_TEKST } from "./en";
import { LT_MALER, LT_TEKST } from "./lt";
import { PL_MALER, PL_TEKST } from "./pl";

export type Sprak = "nb" | "pl" | "en" | "lt";
export const SPRAK: Record<Sprak, string> = { nb: "Norsk", pl: "Polski", en: "English", lt: "Lietuvių" };
export const SPRAKENE = Object.keys(SPRAK) as Sprak[];
export const erSprak = (s: unknown): s is Sprak => typeof s === "string" && s in SPRAK;

let aktivt: Sprak = "nb";
let observer: MutationObserver | null = null;
const ORDBOK: Record<Exclude<Sprak, "nb">, { tekst: Record<string, string>; maler: [string, string][] }> = {
  pl: { tekst: PL_TEKST, maler: PL_MALER }, en: { tekst: EN_TEKST, maler: EN_MALER }, lt: { tekst: LT_TEKST, maler: LT_MALER },
};
const kompilert = new Map<Sprak, (readonly [RegExp, string])[]>();
const maler = () => { let m = kompilert.get(aktivt); if (!m) { m = aktivt === "nb" ? [] : ORDBOK[aktivt].maler.map(([rx, ut]) => [new RegExp(rx), ut] as const); kompilert.set(aktivt, m); } return m; };
const ATTR = ["placeholder", "title", "aria-label"];
const MND = /\b(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|aug|sep|okt|nov|des|man|tir|ons|tor|fre|lør|søn|i dag|i går)\b\.?/gi;
const KORT_PL: Record<string, string> = {
  januar: "stycznia", februar: "lutego", mars: "marca", april: "kwietnia", mai: "maja", juni: "czerwca", juli: "lipca", august: "sierpnia",
  september: "września", oktober: "października", november: "listopada", desember: "grudnia",
  jan: "sty", feb: "lut", mar: "mar", apr: "kwi", jun: "cze", jul: "lip", aug: "sie", sep: "wrz", okt: "paź", nov: "lis", des: "gru",
  mandag: "poniedziałek", tirsdag: "wtorek", onsdag: "środa", torsdag: "czwartek", fredag: "piątek", lørdag: "sobota", søndag: "niedziela",
  man: "pon", tir: "wt", ons: "śr", tor: "czw", fre: "pt", lør: "sob", søn: "nd", "i dag": "dzisiaj", "i går": "wczoraj",
};
const KORT_EN: Record<string, string> = {
  januar: "January", februar: "February", mars: "March", april: "April", mai: "May", juni: "June", juli: "July", august: "August",
  september: "September", oktober: "October", november: "November", desember: "December",
  jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", jun: "Jun", jul: "Jul", aug: "Aug", sep: "Sep", okt: "Oct", nov: "Nov", des: "Dec",
  mandag: "Monday", tirsdag: "Tuesday", onsdag: "Wednesday", torsdag: "Thursday", fredag: "Friday", lørdag: "Saturday", søndag: "Sunday",
  man: "Mon", tir: "Tue", ons: "Wed", tor: "Thu", fre: "Fri", lør: "Sat", søn: "Sun", "i dag": "today", "i går": "yesterday",
};
const KORT_LT: Record<string, string> = {
  januar: "sausio", februar: "vasario", mars: "kovo", april: "balandžio", mai: "gegužės", juni: "birželio", juli: "liepos", august: "rugpjūčio",
  september: "rugsėjo", oktober: "spalio", november: "lapkričio", desember: "gruodžio",
  jan: "saus.", feb: "vas.", mar: "kov.", apr: "bal.", jun: "birž.", jul: "liep.", aug: "rugp.", sep: "rugs.", okt: "spal.", nov: "lapkr.", des: "gruod.",
  mandag: "pirmadienis", tirsdag: "antradienis", onsdag: "trečiadienis", torsdag: "ketvirtadienis", fredag: "penktadienis", lørdag: "šeštadienis", søndag: "sekmadienis",
  man: "pr", tir: "an", ons: "tr", tor: "kt", fre: "pn", lør: "š", søn: "s", "i dag": "šiandien", "i går": "vakar",
};
const KORT: Record<Exclude<Sprak, "nb">, Record<string, string>> = { pl: KORT_PL, en: KORT_EN, lt: KORT_LT };

/** Oversetter én tekst til det valgte språket, eller gir den tilbake uendret */
export function oversett(tekst: string): string {
  if (aktivt === "nb") return tekst;
  const s = tekst.replace(/\s+/g, " ").trim();
  if (!s) return tekst;
  const fore = tekst.match(/^\s*/)![0], etter = tekst.match(/\s*$/)![0];
  const direkte = ORDBOK[aktivt].tekst[s];
  if (direkte) return fore + direkte + etter;
  for (const [rx, ut] of maler()) if (rx.test(s)) return fore + s.replace(rx, ut).replace(/\$\d/g, "") + etter;
  // Datoer og korte tekster med måned/ukedag, f.eks. «10. okt.» eller «man 6.10»
  if (s.length < 300 && /\d/.test(s)) {
    const k = KORT[aktivt];
    const ny = s.replace(MND, (m) => k[m.toLowerCase().replace(/\.$/, "")] ?? m);
    if (ny !== s) return fore + ny + etter;
  }
  return tekst;
}

const original = new WeakMap<Node, string>();
function oversettNode(n: Node) {
  if (n.nodeType === Node.TEXT_NODE) {
    const p = n.parentElement;
    if (!p || p.closest("script, style, textarea, [data-ikke-oversett]")) return;
    const v = n.nodeValue ?? "";
    const ny = oversett(v);
    if (ny !== v) { original.set(n, v); n.nodeValue = ny; }
  } else if (n.nodeType === Node.ELEMENT_NODE) {
    const el = n as Element;
    if (el.closest("[data-ikke-oversett]")) return;
    for (const a of ATTR) { const v = el.getAttribute(a); if (v) { const ny = oversett(v); if (ny !== v) el.setAttribute(a, ny); } }
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let c = w.nextNode(); c; c = w.nextNode()) {
      if (c.nodeType === Node.TEXT_NODE) oversettNode(c);
      else for (const a of ATTR) { const e = c as Element; const v = e.getAttribute(a); if (v) { const ny = oversett(v); if (ny !== v) e.setAttribute(a, ny); } }
    }
  }
}

/** Skru på språket for hele siden. Bytte tilbake til norsk laster siden på nytt. */
export function settSprak(s: Sprak) {
  if (s === aktivt) return;
  const forrige = aktivt;
  aktivt = s;
  try { localStorage.setItem("sprak", s); } catch { /* privat modus */ }
  document.documentElement.lang = s;
  if (s === "nb" || forrige !== "nb") { observer?.disconnect(); observer = null; if (forrige !== "nb") { location.reload(); return; } }
  if (s === "nb") return;
  oversettNode(document.body);
  observer = new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === "characterData") oversettNode(m.target);
      else if (m.type === "attributes") oversettNode(m.target);
      else m.addedNodes.forEach(oversettNode);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
}

export const sprak = () => aktivt;
/** Språket som sist ble brukt i denne nettleseren (før innlogging) */
export function lagretSprak(): Sprak {
  try { const s = localStorage.getItem("sprak"); return erSprak(s) ? s : "nb"; } catch { return "nb"; }
}
