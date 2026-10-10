import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { lagretSprak, settSprak } from "./lib/sprak";

// Språket som sist ble brukt på denne enheten (gjelder også innloggingen)
settSprak(lagretSprak());

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
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
