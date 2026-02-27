import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  color?: 'accent' | 'secondary' | 'purple' | 'amber';
  size?: 'compact' | 'default';
}

const colorMap = {
  accent: {
    bg: 'bg-bridge-accent/10',
    text: 'text-bridge-accent',
    glow: 'rgba(99,102,241,0.15)',
    button: 'bg-bridge-accent hover:bg-bridge-accent/90',
  },
  secondary: {
    bg: 'bg-bridge-secondary/10',
    text: 'text-bridge-secondary',
    glow: 'rgba(45,212,191,0.15)',
    button: 'bg-bridge-secondary hover:bg-bridge-secondary/90',
  },
  purple: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    glow: 'rgba(168,85,247,0.15)',
    button: 'bg-purple-500 hover:bg-purple-500/90',
  },
  amber: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    glow: 'rgba(245,158,11,0.15)',
    button: 'bg-amber-500 hover:bg-amber-500/90',
  },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  color = 'accent',
  size = 'default',
}: EmptyStateProps) {
  const colors = colorMap[color];
  const isCompact = size === 'compact';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center ${
        isCompact ? 'py-8 px-4' : 'py-16 px-6'
      }`}
    >
      {/* Icon with glow */}
      <div className="relative mb-4">
        <div
          className={`${isCompact ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} ${colors.bg} flex items-center justify-center relative z-10`}
        >
          <Icon className={`${isCompact ? 'w-5 h-5' : 'w-6 h-6'} ${colors.text}`} />
        </div>
        <div
          className="absolute inset-0 blur-xl rounded-full opacity-60"
          style={{ background: colors.glow }}
        />
      </div>

      {/* Title */}
      <h3 className={`${isCompact ? 'text-sm' : 'text-base'} font-bold text-foreground mb-1.5`}>
        {title}
      </h3>

      {/* Description */}
      <p className={`text-sm text-slate-500 max-w-xs ${isCompact ? 'mb-4' : 'mb-6'}`}>
        {description}
      </p>

      {/* CTA Button */}
      {action && (
        <button
          onClick={action.onClick}
          className={`px-4 py-2 rounded-xl text-sm font-bold text-white ${colors.button} shadow-glow-accent transition-all hover:shadow-lg`}
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}
