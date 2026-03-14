interface StyleOptionsData {
  type: string;
  stroke_weight: string;
  corner_radius: string;
  padding_ratio: number;
  background: string;
}

interface StyleOptionsProps {
  options: StyleOptionsData;
  onChange: (options: StyleOptionsData) => void;
  analysisResult?: {
    style: string;
    stroke_weight: string;
    corner_radius: string;
    fill: string;
    detail: string;
    padding_ratio: number;
  } | null;
}

const STYLE_TYPES = [
  { value: 'line', label: 'Line' },
  { value: 'solid', label: 'Solid' },
  { value: 'duotone', label: 'Duotone' },
];

const STROKE_WEIGHTS = [
  { value: 'thin', label: 'Thin' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'bold', label: 'Bold' },
];

const CORNER_RADII = [
  { value: 'sharp', label: 'Sharp' },
  { value: 'slightly-rounded', label: 'Slight' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'fully-rounded', label: 'Full' },
];

const BACKGROUNDS = [
  { value: 'transparent', label: 'Transparent' },
  { value: 'white', label: 'White' },
];

function OptionGroup({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`
              px-3 py-1.5 text-xs rounded-lg transition-all
              ${value === opt.value
                ? 'bg-bridge-accent text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}
            `}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StyleOptions({ options, onChange, analysisResult }: StyleOptionsProps) {
  const update = (key: keyof StyleOptionsData, value: string | number) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Style Options
        </label>
        {analysisResult && (
          <span className="text-xs text-bridge-accent">
            Auto-detected from reference
          </span>
        )}
      </div>

      <div className="space-y-4 p-4 bg-white/5 rounded-xl border border-white/10">
        <OptionGroup
          label="Type"
          options={STYLE_TYPES}
          value={options.type}
          onChange={(v) => update('type', v)}
        />
        <OptionGroup
          label="Stroke"
          options={STROKE_WEIGHTS}
          value={options.stroke_weight}
          onChange={(v) => update('stroke_weight', v)}
        />
        <OptionGroup
          label="Corners"
          options={CORNER_RADII}
          value={options.corner_radius}
          onChange={(v) => update('corner_radius', v)}
        />
        <OptionGroup
          label="Background"
          options={BACKGROUNDS}
          value={options.background}
          onChange={(v) => update('background', v)}
        />

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Padding ({Math.round(options.padding_ratio * 100)}%)
          </label>
          <input
            type="range"
            min="5"
            max="30"
            value={Math.round(options.padding_ratio * 100)}
            onChange={(e) => update('padding_ratio', Number(e.target.value) / 100)}
            className="w-full accent-bridge-accent"
          />
        </div>
      </div>
    </div>
  );
}

export type { StyleOptionsData };
