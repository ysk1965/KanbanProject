import { useState } from "react";
import { Plus, X, Grid3X3 } from "lucide-react";

interface IconNameInputProps {
  names: string[];
  onChange: (names: string[]) => void;
  layout: string;
  onLayoutChange: (layout: string) => void;
}

const LAYOUTS = ["2x2", "3x3", "4x4"];

export function IconNameInput({
  names,
  onChange,
  layout,
  onLayoutChange,
}: IconNameInputProps) {
  const [inputValue, setInputValue] = useState("");

  const maxIcons = (() => {
    const [c, r] = layout.split("x").map(Number);
    return c * r;
  })();

  const addName = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || names.length >= maxIcons) return;
    // comma-separated 입력 지원
    const newNames = trimmed
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const combined = [...names, ...newNames].slice(0, maxIcons);
    onChange(combined);
    setInputValue("");
  };

  const removeName = (index: number) => {
    onChange(names.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addName();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Icon Names ({names.length}/{maxIcons})
        </label>
        <div className="flex items-center gap-1">
          <Grid3X3 className="w-3.5 h-3.5 text-slate-500" />
          {LAYOUTS.map((l) => (
            <button
              key={l}
              onClick={() => onLayoutChange(l)}
              className={`
                px-3 py-2 min-h-11 text-xs rounded transition-all
                ${
                  layout === l
                    ? "bg-bridge-accent text-white"
                    : "bg-white/5 text-slate-500 hover:bg-white/10"
                }
              `}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. home, settings, user"
          disabled={names.length >= maxIcons}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl py-2.5 px-4
            text-sm text-white placeholder-slate-600
            focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
            transition-all disabled:opacity-40"
        />
        <button
          onClick={addName}
          disabled={!inputValue.trim() || names.length >= maxIcons}
          className="px-3 py-2.5 bg-bridge-accent text-white rounded-xl
            hover:bg-bridge-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {names.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {names.map((name, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/5 border border-white/10
                rounded-lg text-xs text-white"
            >
              <span className="text-slate-500 text-xs mr-0.5">{i + 1}</span>
              {name}
              <button
                onClick={() => removeName(i)}
                className="ml-0.5 text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-600">
        Tip: Separate multiple names with commas
      </p>
    </div>
  );
}
