import { MessageSquare, Info } from 'lucide-react';

interface CustomPromptProps {
  value: string;
  onChange: (value: string) => void;
}

const MAX_LENGTH = 500;

export function CustomPrompt({ value, onChange }: CustomPromptProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <MessageSquare className="w-3 h-3" />
          Custom Prompt
        </label>
        <span className="text-[10px] text-slate-600">Optional</span>
      </div>

      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => {
            if (e.target.value.length <= MAX_LENGTH) {
              onChange(e.target.value);
            }
          }}
          placeholder="Add extra instructions for icon generation...&#10;e.g. &quot;Use rounded endpoints&quot;, &quot;Make icons playful and friendly&quot;, &quot;Use consistent 2px stroke&quot;"
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4
            text-sm text-white placeholder-slate-600 resize-none
            focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
            transition-all"
        />
        <span className={`absolute bottom-2 right-3 text-[10px] ${
          value.length > MAX_LENGTH * 0.9 ? 'text-amber-400' : 'text-slate-600'
        }`}>
          {value.length}/{MAX_LENGTH}
        </span>
      </div>

      {!value && (
        <p className="flex items-start gap-1.5 text-[10px] text-slate-600">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          Describe any specific style details, mood, or constraints you want applied to the generated icons.
        </p>
      )}
    </div>
  );
}
