// Push-varsler (Web Push): slå på/av på denne telefonen/PC-en.
import { api } from "./api";

/** Offentlig VAPID-nøkkel (den private ligger bare i databasen for edge-funksjonen) */
const VAPID = "BJ-SocAiKKaMiOcP8wCte5ONtwP1T8C8yTfa5khV1jO0qY9o7Tw8MUGzNSq5Jt-J1v66DFUZ87XL9_e0CUkJNrw";

export type PushStatus = "på" | "av" | "blokkert" | "installer-først" | "ikke-støttet";

const erIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const erInstallert = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function pushStatus(): Promise<PushStatus> {
  if (api.modus === "demo") return "ikke-støttet";
  if (erIos() && !erInstallert()) return "installer-først";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "ikke-støttet";
  if (Notification.permission === "denied") return "blokkert";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "på" : "av";
}

function nokkel(b64: string) {
  const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function lagre(sub: PushSubscription) {
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.lagrePush(j.endpoint, j.keys.p256dh, j.keys.auth);
}

/** Ber om lov og melder denne enheten på. Gir ny status. */
export async function slaaPaPush(): Promise<PushStatus> {
  const lov = await Notification.requestPermission();
  if (lov !== "granted") return lov === "denied" ? "blokkert" : "av";
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: nokkel(VAPID) }));
  await lagre(sub);
  return "på";
}

export async function slaaAvPush(): Promise<PushStatus> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await api.slettPush(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
  return "av";
}

/** Ved oppstart: hvis varsler er på, sørg for at databasen har riktig (ev. fornyet) abonnement */
export async function fornyPush() {
  try {
    if ((await pushStatus()) !== "på") return;
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) await lagre(sub);
  } catch { /* prøver igjen neste gang */ }
}
