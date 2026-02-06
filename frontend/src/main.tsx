import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./app/App.tsx";
import "./styles/index.css";

// Firebase & Sentry initialization (dynamic import to prevent ad blockers from breaking the app)
import("./lib/sentry")
  .then(({ initializeSentry }) => initializeSentry())
  .catch(() => console.warn("[Sentry] Failed to load"));

import("./lib/firebase")
  .then(({ initializeAllFirebaseServices }) =>
    initializeAllFirebaseServices().then(({ analytics, performance }) => {
      if (analytics) console.log("[App] Firebase Analytics ready");
      if (performance) console.log("[App] Firebase Performance ready");
    })
  )
  .catch(() => console.warn("[Firebase] Failed to load"));

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

createRoot(document.getElementById("root")!).render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </GoogleOAuthProvider>
);
