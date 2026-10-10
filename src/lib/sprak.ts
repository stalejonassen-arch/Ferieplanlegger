// Språk i brukerflaten. Norsk er grunnspråket; for polsk oversettes teksten på skjermen fortløpende
// (tekstnoder og placeholder/title/aria-label), slik at alle visninger får det uten å endre hver komponent.
// Det de ansatte selv skriver (prosjektnavn, kommentarer o.l.) treffer ikke ordlista og står urørt.
import { PL_MALER, PL_TEKST } from "./pl";

export type Sprak = "nb" | "pl";
export const SPRAK: Record<Sprak, string> = { nb: "Norsk", pl: "Polski" };

let aktivt: Sprak = "nb";
let observer: MutationObserver | null = null;
const maler = PL_MALER.map(([rx, ut]) => [new RegExp(rx), ut] as const);
const ATTR = ["placeholder", "title", "aria-label"];
const MND = /\b(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|aug|sep|okt|nov|des|man|tir|ons|tor|fre|lør|søn|i dag|i går)\b\.?/gi;
const KORT: Record<string, string> = {
  januar: "stycznia", februar: "lutego", mars: "marca", april: "kwietnia", mai: "maja", juni: "czerwca", juli: "lipca", august: "sierpnia",
  september: "września", oktober: "października", november: "listopada", desember: "grudnia",
  jan: "sty", feb: "lut", mar: "mar", apr: "kwi", jun: "cze", jul: "lip", aug: "sie", sep: "wrz", okt: "paź", nov: "lis", des: "gru",
  mandag: "poniedziałek", tirsdag: "wtorek", onsdag: "środa", torsdag: "czwartek", fredag: "piątek", lørdag: "sobota", søndag: "niedziela",
  man: "pon", tir: "wt", ons: "śr", tor: "czw", fre: "pt", lør: "sob", søn: "nd", "i dag": "dzisiaj", "i går": "wczoraj",
};

/** Oversetter én tekst til polsk, eller gir den tilbake uendret */
export function oversett(tekst: string): string {
  const s = tekst.replace(/\s+/g, " ").trim();
  if (!s) return tekst;
  const fore = tekst.match(/^\s*/)![0], etter = tekst.match(/\s*$/)![0];
  const direkte = PL_TEKST[s];
  if (direkte) return fore + direkte + etter;
  for (const [rx, ut] of maler) if (rx.test(s)) return fore + s.replace(rx, ut).replace(/\$\d/g, "") + etter;
  // Datoer og korte tekster med måned/ukedag, f.eks. «10. okt.» eller «man 6.10»
  if (s.length < 300 && /\d/.test(s)) {
    const ny = s.replace(MND, (m) => KORT[m.toLowerCase().replace(/\.$/, "")] ?? m);
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
  document.documentElement.lang = s === "pl" ? "pl" : "nb";
  if (s === "nb") { observer?.disconnect(); observer = null; if (forrige !== "nb") location.reload(); return; }
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
  try { return localStorage.getItem("sprak") === "pl" ? "pl" : "nb"; } catch { return "nb"; }
}
