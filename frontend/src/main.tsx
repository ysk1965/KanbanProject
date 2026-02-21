import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Capacitor } from "@capacitor/core";
import App from "./app/App.tsx";
import "./styles/index.css";
import "./app/i18n";

const isNativePlatform = Capacitor.isNativePlatform();

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

// Native: initialize Google Auth plugin (uses native SDK instead of web OAuth)
if (isNativePlatform) {
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  import("@codetrix-studio/capacitor-google-auth").then(({ GoogleAuth }) => {
    GoogleAuth.initialize({
      clientId: GOOGLE_CLIENT_ID,
      scopes: ["profile", "email"],
    });
    console.log("[App] Native Google Auth initialized");
  }).catch(() => console.warn("[GoogleAuth] Failed to initialize native Google Auth"));
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const AppWithRouter = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

// Web: wrap with GoogleOAuthProvider; Native: skip (uses native SDK)
createRoot(document.getElementById("root")!).render(
  (GOOGLE_CLIENT_ID && !isNativePlatform)
    ? <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{AppWithRouter}</GoogleOAuthProvider>
    : AppWithRouter
);
