import { type ReactNode } from 'react';
import { Pipette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface ColorPickerPopoverProps {
  colors: string[];
  selectedColor: string;
  onColorChange: (color: string) => void;
  disabled?: boolean;
  /** Trigger dot size: sm=4, md=5, lg=7 (Tailwind w-unit) */
  triggerSize?: 'sm' | 'md' | 'lg';
  /** Trigger dot shape */
  triggerShape?: 'circle' | 'square';
  /** Show glow effect on trigger */
  showGlow?: boolean;
  /** Show custom color picker section */
  showCustomColor?: boolean;
  /** Custom color label override */
  customColorLabel?: string;
  /** Popover alignment */
  align?: 'start' | 'center' | 'end';
  /** Number of grid columns (default 5) */
  columns?: number;
  /** Custom trigger element. Replaces the default color dot trigger. */
  children?: ReactNode;
}

const TRIGGER_SIZE_MAP = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-7 h-7',
} as const;

const SWATCH_SIZE_MAP = {
  sm: 'w-6 h-6',
  md: 'w-7 h-7',
  lg: 'w-8 h-8',
} as const;

export function ColorPickerPopover({
  colors,
  selectedColor,
  onColorChange,
  disabled = false,
  triggerSize = 'md',
  triggerShape = 'square',
  showGlow = true,
  showCustomColor = true,
  customColorLabel,
  align = 'start',
  columns = 5,
  children,
}: ColorPickerPopoverProps) {
  const { t } = useTranslation();
  const label = customColorLabel ?? t('featureDetail.customColor', '커스텀 색상');
  const shapeClass = triggerShape === 'circle' ? 'rounded-full' : 'rounded-md';

  if (disabled) {
    if (children) return <>{children}</>;
    return (
      <div
        className={`${TRIGGER_SIZE_MAP[triggerSize]} ${shapeClass} shadow-lg flex-shrink-0`}
        style={{
          backgroundColor: selectedColor,
          ...(showGlow ? { boxShadow: `0 0 15px ${selectedColor}88` } : {}),
          border: '1px solid rgba(255,255,255,0.2)',
        }}
      />
    );
  }

  const defaultTrigger = (
    <button
      className={`${TRIGGER_SIZE_MAP[triggerSize]} ${shapeClass} shadow-lg flex-shrink-0 transition-all duration-300 hover:scale-125 cursor-pointer`}
      style={{
        backgroundColor: selectedColor,
        ...(showGlow ? { boxShadow: `0 0 15px ${selectedColor}88` } : {}),
        border: '1px solid rgba(255,255,255,0.2)',
      }}
    />
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        {children || defaultTrigger}
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-3 bg-bridge-obsidian border-foreground/10"
        align={align}
        sideOffset={8}
      >
        <div className="space-y-3">
          {/* Color Grid */}
          <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => onColorChange(color)}
                className={`${SWATCH_SIZE_MAP[triggerSize]} rounded-full transition-all duration-200 ${
                  selectedColor === color
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-bridge-obsidian scale-110'
                    : 'opacity-50 hover:opacity-100 hover:scale-110'
                }`}
                style={{
                  backgroundColor: color,
                  boxShadow: selectedColor === color ? `0 0 12px ${color}` : 'none',
                }}
              />
            ))}
          </div>

          {/* Custom Color Picker */}
          {showCustomColor && (
            <div className="border-t border-foreground/10 pt-3">
              <label className="flex items-center gap-2 cursor-pointer group">
                <Pipette size={14} className="text-slate-400 group-hover:text-foreground transition-colors" />
                <span className="text-[11px] text-slate-400 group-hover:text-foreground transition-colors">
                  {label}
                </span>
                <input
                  type="color"
                  value={selectedColor}
                  onChange={(e) => onColorChange(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border-none bg-transparent ml-auto [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-foreground/10 [&::-webkit-color-swatch]:border"
                />
              </label>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
