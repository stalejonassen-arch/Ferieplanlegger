// Lager kalenderfiler (.ics) som kan åpnes i iPhone-kalender, Google Kalender og Outlook.
import { addDays, type Soknad } from "./ferie";

const dato = (iso: string) => iso.replace(/-/g, "");
const tekst = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** Bretter lange linjer slik standarden krever (maks 75 tegn per linje). */
function brett(linje: string) {
  const ut: string[] = [];
  let rest = linje;
  while (rest.length > 74) { ut.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  ut.push(rest);
  return ut.join("\r\n");
}

export function lagIcs(soknader: Soknad[], navn: string, stempel = new Date()): string {
  const naa = stempel.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const hendelser = soknader.map((s) => [
    "BEGIN:VEVENT",
    `UID:ferie-${s.id}@ferieplanlegger.austnes.no`,
    `DTSTAMP:${naa}`,
    `DTSTART;VALUE=DATE:${dato(s.fra)}`,
    `DTEND;VALUE=DATE:${dato(addDays(s.til, 1))}`, // sluttdato er «til og med», så kalenderen trenger dagen etter
    `SUMMARY:${tekst(`Ferie – ${navn}`)}`,
    ...(s.merknad ? [`DESCRIPTION:${tekst(s.merknad)}`] : []),
    "TRANSP:OPAQUE",
    "STATUS:CONFIRMED",
    "END:VEVENT",
  ]).flat();
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//N L Austnes AS//Ferieplanlegger//NO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...hendelser,
    "END:VCALENDAR",
  ].map(brett).join("\r\n") + "\r\n";
}

/** Laster ned filen. På mobil åpner den kalenderappen og spør om du vil legge til. */
export function lastNedIcs(innhold: string, filnavn: string) {
  const url = URL.createObjectURL(new Blob([innhold], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filnavn;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
