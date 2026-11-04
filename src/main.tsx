import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Fonts ship inside the app so notes look the same offline (no Google Fonts fetch).
import "@fontsource/caveat/400.css";
import "@fontsource/caveat/500.css";
import "@fontsource/caveat/600.css";
import "@fontsource/caveat/700.css";
import "@fontsource/patrick-hand/400.css";

// Surface console errors so they're visible when running in Tauri
window.onerror = (message, source, lineno, colno, error) => {
  console.error("[Pin Notes Error]", message, source, lineno, colno, error);
  return false;
};
window.onunhandledrejection = (event) => {
  console.error("[Pin Notes Unhandled Rejection]", event.reason);
};

async function boot() {
  // Plain-browser dev mode: fake the Tauri backend so the UI can be exercised without the app.
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    (await import("./dev/mockTauri")).installMockTauri();
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
boot();
