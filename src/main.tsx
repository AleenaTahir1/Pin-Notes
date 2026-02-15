import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Surface console errors so they're visible when running in Tauri
window.onerror = (message, source, lineno, colno, error) => {
  console.error("[Pin Notes Error]", message, source, lineno, colno, error);
  return false;
};
window.onunhandledrejection = (event) => {
  console.error("[Pin Notes Unhandled Rejection]", event.reason);
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
