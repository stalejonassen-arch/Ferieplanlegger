// Push-varsler (lastes inn i service workeren). Viser varselet og åpner riktig side når det trykkes på.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { tekst: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.tittel || "ByggLogg", {
    body: d.tekst || "",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const vinduer = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const v = vinduer.find((c) => c.url.startsWith(self.location.origin));
    if (v) {
      await v.focus();
      try { await v.navigate(url); } catch { v.postMessage({ type: "naviger", url }); }
      return;
    }
    await self.clients.openWindow(url);
  })());
});
