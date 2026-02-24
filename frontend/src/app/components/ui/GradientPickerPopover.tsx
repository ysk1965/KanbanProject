import { Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface GradientPickerPopoverProps {
  gradients: string[];
  selectedGradient: string;
  onGradientChange: (gradient: string) => void;
  disabled?: boolean;
  /** Trigger dot size: sm=4, md=5, lg=7 (Tailwind w-unit) */
  triggerSize?: 'sm' | 'md' | 'lg';
  /** Popover alignment */
  align?: 'start' | 'center' | 'end';
  /** Number of grid columns (default 6) */
  columns?: number;
}

const TRIGGER_SIZE_MAP = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-7 h-7',
} as const;

export function GradientPickerPopover({
  gradients,
  selectedGradient,
  onGradientChange,
  disabled = false,
  triggerSize = 'md',
  align = 'start',
  columns = 6,
}: GradientPickerPopoverProps) {
  if (disabled) {
    return (
      <div
        className={`${TRIGGER_SIZE_MAP[triggerSize]} rounded-md shadow-lg flex-shrink-0`}
        style={{
          background: selectedGradient,
          border: '1px solid rgba(255,255,255,0.2)',
        }}
      />
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`${TRIGGER_SIZE_MAP[triggerSize]} rounded-md shadow-lg flex-shrink-0 transition-all duration-300 hover:scale-125 cursor-pointer`}
          style={{
            background: selectedGradient,
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-3 bg-bridge-obsidian border-foreground/10"
        align={align}
        sideOffset={8}
      >
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {gradients.map((gradient, i) => (
            <button
              key={i}
              onClick={() => onGradientChange(gradient)}
              className="h-8 w-8 rounded-lg relative overflow-hidden transition-all duration-200 hover:scale-110"
              style={{ background: gradient }}
            >
              {selectedGradient === gradient && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                  <Check size={14} className="text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
