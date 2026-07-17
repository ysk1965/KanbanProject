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
  .then(({ initializeSentry, isSentryConfigured }) => {
    initializeSentry();
    // Sentry가 켜져 있으면 전역 에러/미처리 Promise 거부는 Sentry 기본 계측이 이미 수집한다.
    // DSN이 없는 환경에서는 최소한 콘솔에 남겨 렌더 밖(async/이벤트 콜백) 에러의 흔적을 확보한다.
    if (!isSentryConfigured()) {
      window.addEventListener("unhandledrejection", (e) =>
        console.error("[unhandledrejection]", e.reason),
      );
      window.addEventListener("error", (e) =>
        console.error("[window.onerror]", e.error ?? e.message),
      );
    }
  })
  .catch(() => console.warn("[Sentry] Failed to load"));

import("./lib/firebase")
  .then(({ initializeAllFirebaseServices }) =>
    initializeAllFirebaseServices().then(({ analytics, performance }) => {
      if (analytics) console.log("[App] Firebase Analytics ready");
      if (performance) console.log("[App] Firebase Performance ready");
    }),
  )
  .catch(() => console.warn("[Firebase] Failed to load"));

// Native: initialize Google Auth plugin (uses native SDK instead of web OAuth)
if (isNativePlatform) {
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  import("@codetrix-studio/capacitor-google-auth")
    .then(({ GoogleAuth }) => {
      GoogleAuth.initialize({
        clientId: GOOGLE_CLIENT_ID,
        scopes: ["profile", "email"],
      });
      console.log("[App] Native Google Auth initialized");
    })
    .catch(() =>
      console.warn("[GoogleAuth] Failed to initialize native Google Auth"),
    );
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const AppWithRouter = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

// Web: wrap with GoogleOAuthProvider; Native: skip (uses native SDK)
createRoot(document.getElementById("root")!).render(
  GOOGLE_CLIENT_ID && !isNativePlatform ? (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {AppWithRouter}
    </GoogleOAuthProvider>
  ) : (
    AppWithRouter
  ),
);
