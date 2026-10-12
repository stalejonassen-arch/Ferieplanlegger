// Leser teksten på et kursbevis rett på telefonen/PC-en (ingenting sendes ut):
// PDF med tekst leses direkte, bilder og skannede PDF-er leses med tekstgjenkjenning (Tesseract).
// Bibliotekene lastes først når noen faktisk laster opp et bevis.
import { lesBevis, type Funn } from "./kompetanse";

async function pdfSider(fil: File): Promise<{ tekst: string; bilde: Blob | null }> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await fil.arrayBuffer()) }).promise;
  let tekst = "";
  for (let i = 1; i <= Math.min(doc.numPages, 2); i++) {
    const side = await doc.getPage(i);
    const innhold = await side.getTextContent();
    tekst += innhold.items.map((x) => ("str" in x ? x.str + ((x as { hasEOL?: boolean }).hasEOL ? "\n" : " ") : "")).join("") + "\n";
  }
  if (tekst.replace(/\s/g, "").length > 40) return { tekst, bilde: null };
  // Skannet PDF: tegn første side og les den som bilde
  const side = await doc.getPage(1);
  const vp = side.getViewport({ scale: 2 });
  const lerret = document.createElement("canvas");
  lerret.width = vp.width; lerret.height = vp.height;
  await side.render({ canvasContext: lerret.getContext("2d")!, viewport: vp }).promise;
  const bilde = await new Promise<Blob | null>((r) => lerret.toBlob(r, "image/png"));
  return { tekst: "", bilde };
}

async function ocr(bilde: Blob | File, fremdrift?: (p: number) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const w = await createWorker(["nor", "eng", "pol"], 1, {
    logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") fremdrift?.(m.progress); },
  });
  try { return (await w.recognize(bilde)).data.text; } finally { await w.terminate(); }
}

/** Leser et kursbevis (bilde eller PDF) og gir det som ble funnet: kurstype, datoer, kursholder. */
export async function lesKursbevis(fil: File, fremdrift?: (p: number) => void): Promise<Funn & { tekst: string }> {
  let tekst = "";
  if (fil.type === "application/pdf" || /\.pdf$/i.test(fil.name)) {
    const s = await pdfSider(fil);
    tekst = s.tekst || (s.bilde ? await ocr(s.bilde, fremdrift) : "");
  } else {
    tekst = await ocr(fil, fremdrift);
  }
  return { ...lesBevis(tekst), tekst };
}
