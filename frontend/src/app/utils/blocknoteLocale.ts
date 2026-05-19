import { ko, en, ja, zh, vi, es, pt } from "@blocknote/core/locales";
import type { Dictionary } from "@blocknote/core";

// Map BRIDGE i18next language code → BlockNote built-in dictionary.
// BlockNote ships: ar, de, en, es, fr, hr, is, it, ja, ko, nl, no, pl, pt, ru, uk, vi, zh.
// BRIDGE ships:   ko, en, ja, zh, zh-TW, vi, th, es, pt-BR, hi.
// Anything BlockNote doesn't ship falls back to English.
export function blockNoteDictionary(language: string | undefined): Dictionary {
  const base = (language || "en").toLowerCase().split("-")[0];
  switch (base) {
    case "ko":
      return ko;
    case "ja":
      return ja;
    case "zh":
      return zh;
    case "vi":
      return vi;
    case "es":
      return es;
    case "pt":
      return pt;
    default:
      return en;
  }
}
