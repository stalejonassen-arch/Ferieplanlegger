// Ren logikk for Tripletex-koblingen (ingen nettverk eller database), så den kan testes med vanlige enhetstester.
// Brukes av index.ts i samme mappe.

export interface TxAdresse { addressLine1?: string | null; postalCode?: string | null; city?: string | null }
export interface TxKunde {
  id: number; name?: string | null; customerNumber?: number | null; email?: string | null; phoneNumber?: string | null;
  phoneNumberMobile?: string | null; isInactive?: boolean | null; postalAddress?: TxAdresse | null; physicalAddress?: TxAdresse | null;
}
export interface TxProsjekt {
  id: number; number?: string | null; name?: string | null; customer?: { id: number } | null; startDate?: string | null;
  endDate?: string | null; isClosed?: boolean | null; deliveryAddress?: TxAdresse | null;
}
export interface TxAnsatt { id: number; firstName?: string | null; lastName?: string | null; email?: string | null; employeeNumber?: string | null }

const s = (v: unknown) => (v == null ? "" : String(v).trim());

/** Kunde fra Tripletex → rad i kunder-tabellen */
export function tilKunde(k: TxKunde, bedriftId: number, naa: string) {
  const a = k.postalAddress?.addressLine1 ? k.postalAddress : (k.physicalAddress ?? k.postalAddress ?? {});
  return {
    bedrift_id: bedriftId,
    tripletex_id: k.id,
    navn: s(k.name) || `Kunde ${k.customerNumber ?? k.id}`,
    adresse: s(a?.addressLine1),
    postnr: s(a?.postalCode),
    poststed: s(a?.city),
    telefon: s(k.phoneNumberMobile) || s(k.phoneNumber),
    epost: s(k.email),
    aktiv: !k.isInactive,
    oppdatert: naa,
  };
}

/** Adresse som én linje: «Gate 1, 6005 Ålesund» */
export function adresseTekst(a?: TxAdresse | null) {
  if (!a) return "";
  const sted = [s(a.postalCode), s(a.city)].filter(Boolean).join(" ");
  return [s(a.addressLine1), sted].filter(Boolean).join(", ");
}

/** Prosjekt fra Tripletex → rad i prosjekter-tabellen. Prosjektnummeret vises foran navnet hvis det er et tall. */
export function tilProsjekt(p: TxProsjekt, bedriftId: number, kundeId: Map<number, string>, naa: string, idag: string) {
  const avsluttet = !!p.isClosed || (!!p.endDate && p.endDate < idag);
  return {
    bedrift_id: bedriftId,
    tripletex_id: p.id,
    tripletex_nr: s(p.number),
    navn: s(p.name) || `Prosjekt ${s(p.number) || p.id}`,
    kunde_id: p.customer?.id ? kundeId.get(p.customer.id) ?? null : null,
    adresse: adresseTekst(p.deliveryAddress),
    start: p.startDate || null,
    slutt: p.endDate || null,
    aktiv: !avsluttet,
    oppdatert: naa,
  };
}

/** Kobler ansatte i ByggLogg til ansatte i Tripletex på e-post (uten store/små bokstaver), ellers på ansattnummer. */
export function koblAnsatte(
  egne: { id: string; epost: string | null; ansattnr?: string | null; tripletex_id?: number | null }[],
  tx: TxAnsatt[],
) {
  const paaEpost = new Map(tx.filter((t) => t.email).map((t) => [t.email!.trim().toLowerCase(), t.id]));
  const paaNr = new Map(tx.filter((t) => s(t.employeeNumber)).map((t) => [s(t.employeeNumber), t.id]));
  const endringer: { id: string; tripletex_id: number }[] = [];
  for (const a of egne) {
    const ny = (a.epost && paaEpost.get(a.epost.trim().toLowerCase())) || (s(a.ansattnr) && paaNr.get(s(a.ansattnr))) || null;
    if (ny && ny !== a.tripletex_id) endringer.push({ id: a.id, tripletex_id: ny });
  }
  return endringer;
}

/** Godkjente timer slås sammen per ansatt, prosjekt og dag, fordi Tripletex har én timeføring per kombinasjon og aktivitet. */
export interface TimeRad { ansatt_id: string; prosjekt_id: string; dato: string; timer: number; beskrivelse: string }
export interface Samlet { nokkel: string; ansatt_id: string; prosjekt_id: string; dato: string; timer: number; kommentar: string }

export function samleTimer(rader: TimeRad[]): Samlet[] {
  const m = new Map<string, Samlet>();
  for (const r of rader) {
    const nokkel = `${r.ansatt_id}|${r.prosjekt_id}|${r.dato}`;
    const x = m.get(nokkel) ?? { nokkel, ansatt_id: r.ansatt_id, prosjekt_id: r.prosjekt_id, dato: r.dato, timer: 0, kommentar: "" };
    x.timer = Math.round((x.timer + Number(r.timer)) * 100) / 100;
    const b = r.beskrivelse.trim();
    if (b && !x.kommentar.split("; ").includes(b)) x.kommentar = x.kommentar ? `${x.kommentar}; ${b}` : b;
    m.set(nokkel, x);
  }
  return [...m.values()].map((x) => ({ ...x, kommentar: x.kommentar.slice(0, 500) }));
}

/** Hva skal gjøres med en samlet dag: sende ny, oppdatere eller ingenting. */
export function plan(samlet: Samlet[], sendt: Map<string, { tripletex_id: number; timer: number }>) {
  const nye: Samlet[] = [], endret: (Samlet & { tripletex_id: number })[] = [];
  for (const x of samlet) {
    const f = sendt.get(x.nokkel);
    if (!f) nye.push(x);
    else if (Math.abs(f.timer - x.timer) > 0.001) endret.push({ ...x, tripletex_id: f.tripletex_id });
  }
  return { nye, endret };
}

/** Velger aktiviteten timene føres på: den bedriften har valgt, ellers en som heter noe med «arbeid», ellers den første. */
export function velgAktivitet(aktiviteter: { id: number; name?: string | null }[], valgt?: number | null) {
  if (valgt && aktiviteter.some((a) => a.id === valgt)) return valgt;
  return (aktiviteter.find((a) => /arbeid|montering|timer/i.test(a.name ?? "")) ?? aktiviteter[0])?.id ?? null;
}

/** Feilmelding fra Tripletex som en kort, lesbar tekst */
export function txFeil(status: number, body: unknown): string {
  const b = body as { message?: string; validationMessages?: { field?: string; message?: string }[] } | null;
  const v = (b?.validationMessages ?? []).map((m) => [m.field, m.message].filter(Boolean).join(": ")).join("; ");
  if (status === 401) return "Tripletex godtok ikke nøkkelen. Lag en ny ansattnøkkel i Tripletex og koble til på nytt.";
  if (status === 403) return "Nøkkelen mangler tilgang i Tripletex (prosjekt, kunder, ansatte og timer).";
  return `Tripletex svarte ${status}${b?.message ? `: ${b.message}` : ""}${v ? ` (${v})` : ""}`.slice(0, 500);
}
