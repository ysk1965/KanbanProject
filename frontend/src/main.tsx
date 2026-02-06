import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./app/App.tsx";
import "./styles/index.css";

// Firebase & Sentry initialization
import { initializeAllFirebaseServices } from "./lib/firebase";
import { initializeSentry } from "./lib/sentry";

// Initialize Sentry first (for error tracking during initialization)
initializeSentry();

// Initialize Firebase services
initializeAllFirebaseServices().then(({ analytics, performance }) => {
  if (analytics) {
    console.log("[App] Firebase Analytics ready");
  }
  if (performance) {
    console.log("[App] Firebase Performance ready");
  }
});

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

createRoot(document.getElementById("root")!).render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </GoogleOAuthProvider>
);
