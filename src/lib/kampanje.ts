// Kampanjer fra Byggfag (DM): gjør om PDF/bilder til sider, og finner hvilke kampanjer som skal vises.
import type { Ansatt, Kampanje } from "./ferie";
import { komprimer } from "./hms";

export const MAKS_SIDER = 24;

/** Tegner hver side i en PDF som et JPEG-bilde (rundt 1400 px bredt). Biblioteket lastes først ved bruk. */
export async function pdfTilSider(fil: File, fremdrift?: (ferdig: number, av: number) => void): Promise<Blob[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await fil.arrayBuffer()) }).promise;
  const antall = Math.min(doc.numPages, MAKS_SIDER);
  const ut: Blob[] = [];
  for (let i = 1; i <= antall; i++) {
    fremdrift?.(i - 1, antall);
    const side = await doc.getPage(i);
    const v1 = side.getViewport({ scale: 1 });
    const vp = side.getViewport({ scale: Math.min(3, 1400 / v1.width) });
    const lerret = document.createElement("canvas");
    lerret.width = Math.round(vp.width); lerret.height = Math.round(vp.height);
    const ctx = lerret.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, lerret.width, lerret.height);
    await side.render({ canvasContext: ctx, viewport: vp }).promise;
    ut.push(await new Promise<Blob>((ok, feil) => lerret.toBlob((b) => (b ? ok(b) : feil(new Error("Kunne ikke lage bilde av siden."))), "image/jpeg", 0.85)));
  }
  fremdrift?.(antall, antall);
  return ut;
}

/** Filer valgt av leder (PDF og/eller bilder) → sider i rekkefølge */
export async function filerTilSider(filer: File[], fremdrift?: (tekst: string) => void): Promise<Blob[]> {
  const ut: Blob[] = [];
  for (const f of filer) {
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      ut.push(...(await pdfTilSider(f, (n, av) => fremdrift?.(`Gjør om ${f.name}: side ${Math.min(n + 1, av)} av ${av}`))));
    } else if (f.type.startsWith("image/")) {
      fremdrift?.(`Gjør klar ${f.name}`);
      ut.push(await komprimer(f, 2000));
    }
    if (ut.length >= MAKS_SIDER) break;
  }
  return ut.slice(0, MAKS_SIDER);
}

/** Kampanjer som skal vises for denne ansatte i dag */
export function synligeKampanjer(liste: Kampanje[] | undefined, meg: Ansatt, idag: string): Kampanje[] {
  if (meg.vis_kampanjer === false) return [];
  const skjult = new Set(meg.skjulte_kampanjer ?? []);
  return (liste ?? []).filter((k) => k.fra <= idag && k.til >= idag && k.sider.length > 0 && !skjult.has(k.id))
    .sort((a, b) => b.fra.localeCompare(a.fra));
}

export function kampanjeStatus(k: Kampanje, idag: string): "aktiv" | "kommende" | "utlopt" {
  return k.til < idag ? "utlopt" : k.fra > idag ? "kommende" : "aktiv";
}

/** «13.–26. oktober» / «28. sep.–5. okt.» */
export function kampanjePeriode(fra: string, til: string): string {
  const d = (s: string) => new Date(s + "T12:00:00");
  const a = d(fra), b = d(til);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}.–${b.toLocaleDateString("nb-NO", { day: "numeric", month: "long" })}`;
  const k = (x: Date) => x.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
  return `${k(a)}–${k(b)}`;
}
