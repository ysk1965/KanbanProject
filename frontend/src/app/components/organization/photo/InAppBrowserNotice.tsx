import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Copy, Check, X } from "lucide-react";
import { MotionModal } from "../../ui/MotionModal";
import { IconButton } from "../../ui/IconButton";
import { canOpenExternally, openInExternalBrowser } from "../../../utils/platform";
import type { InAppBrowserGate } from "../../../hooks/useInAppBrowserGate";

const DISMISS_KEY = "bridge_inapp_notice_dismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // In-app WebViews often block the async clipboard API
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Banner + guide modal for shared photo pages opened inside an in-app browser
 * (KakaoTalk, Instagram…), where downloads are silently ignored.
 */
export function InAppBrowserNotice({ gate }: { gate: InAppBrowserGate }) {
  const { t } = useTranslation();
  const { kind, guideOpen, openGuide, closeGuide } = gate;
  const [dismissed, setDismissed] = useState(readDismissed);
  const [copied, setCopied] = useState(false);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // storage unavailable
    }
  }, []);

  const handleOpen = useCallback(() => {
    if (!kind) return;
    if (!openInExternalBrowser(kind)) openGuide();
  }, [kind, openGuide]);

  const handleCopy = useCallback(async () => {
    if (await copyText(window.location.href)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  if (!kind) return null;

  const app = t(`inAppBrowser.apps.${kind}`);
  const auto = canOpenExternally(kind);

  return (
    <>
      {!dismissed && (
        <div className="bg-bridge-accent/15 border-b border-bridge-accent/20">
          <div className="max-w-6xl mx-auto pl-6 pr-2 py-2 flex items-center gap-3">
            <ExternalLink size={16} className="text-bridge-accent shrink-0" />
            <p className="flex-1 min-w-0 text-xs text-foreground leading-relaxed">
              {t("inAppBrowser.bannerText", { app })}
            </p>
            <button
              onClick={handleOpen}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all"
            >
              {auto
                ? t("inAppBrowser.openButton")
                : t("inAppBrowser.howButton")}
            </button>
            <IconButton
              aria-label={t("common.close", "Close")}
              onClick={handleDismiss}
              className="text-slate-400 hover:text-foreground"
            >
              <X />
            </IconButton>
          </div>
        </div>
      )}

      <MotionModal
        open={guideOpen}
        onClose={closeGuide}
        accentColor
        aria-labelledby="inapp-guide-title"
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="w-8 h-8 rounded-lg bg-bridge-accent/15 flex items-center justify-center">
            <ExternalLink size={16} className="text-bridge-accent" />
          </div>
          <h2
            id="inapp-guide-title"
            className="text-sm font-bold text-foreground"
          >
            {t("inAppBrowser.guideTitle")}
          </h2>
        </div>

        <div className="px-5 pb-5 pt-4 space-y-4">
          <p className="text-sm text-foreground leading-relaxed">
            {t("inAppBrowser.guideBody", { app })}
          </p>

          {auto ? (
            <button
              onClick={handleOpen}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-bridge-accent text-white rounded-xl text-sm font-bold hover:bg-bridge-accent/90 transition-all"
            >
              <ExternalLink size={16} />
              {t("inAppBrowser.openButton")}
            </button>
          ) : (
            <p className="text-sm text-slate-400 leading-relaxed">
              {t("inAppBrowser.manualSteps")}
            </p>
          )}

          <div className="space-y-2">
            <span className="text-xs text-slate-500">
              {auto
                ? t("inAppBrowser.copyHintAuto")
                : t("inAppBrowser.copyHint")}
            </span>
            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-sm hover:bg-foreground/10 transition-all"
            >
              {copied ? (
                <Check size={16} className="text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy size={16} />
              )}
              {copied
                ? t("inAppBrowser.copied")
                : t("inAppBrowser.copyLink")}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t border-foreground/[0.08]">
          <button
            onClick={closeGuide}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent"
          >
            {t("common.close", "Close")}
          </button>
        </div>
      </MotionModal>
    </>
  );
}
