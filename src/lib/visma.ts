// Om bedriften bruker Visma. Uten Visma skjules det som bare henter tall derfra (omsetning, salg/DG,
// ordrer og fakturerte timer), og tekstene sier ikke «i Visma». Alt annet virker likt.
import type { Data } from "./ferie";

export const harVisma = (d: Pick<Data, "prosjekter"> & { visma?: boolean }) => d.visma ?? d.prosjekter.some((p) => p.visma_nr != null);
