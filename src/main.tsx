import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ServiceSkjema } from "./views/ServiceSkjema";
import "./styles.css";
import { lagretSprak, settSprak } from "./lib/sprak";

// bygglogg.app uten «?demo» er hjemmesiden. Serveren viser den direkte, men en lagret app-versjon i telefonen kan svare først.
try {
  if (location.hostname === "bygglogg.app" && location.pathname === "/" && !new URLSearchParams(location.search).has("demo") && !new URLSearchParams(location.search).has("service") && !sessionStorage.getItem("bygglogg-demo")) location.replace("/hjem.html");
} catch { /* privat modus */ }

// Språket som sist ble brukt på denne enheten (gjelder også innloggingen)
settSprak(lagretSprak());

// Kundeskjema for serviceoppdrag (uten innlogging)
const serviceNokkel = new URLSearchParams(location.search).get("service");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {serviceNokkel ? <ServiceSkjema nokkel={serviceNokkel} /> : <App />}
  </React.StrictMode>,
);

// Når en ny versjon av appen er lastet ned, last siden på nytt så alle får den med en gang
if ("serviceWorker" in navigator) {
  // Bare ved oppdatering (ikke første gang appen installeres), ellers mister man det man holder på å skrive
  const haddeVersjon = !!navigator.serviceWorker.controller;
  let lastet = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (lastet || !haddeVersjon) return;
    lastet = true;
    location.reload();
  });
  // Se etter oppdatering hver gang appen åpnes igjen
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
  });
}
