import React from 'react';

interface AmbientBackgroundProps {
  /** Show accent (indigo) orb */
  accent?: boolean;
  /** Show secondary (teal) orb */
  secondary?: boolean;
}

export function AmbientBackground({ accent = true, secondary = true }: AmbientBackgroundProps) {
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0"
      aria-hidden="true"
    >
      {accent && (
        <div
          className="absolute top-[-15%] left-[8%] w-[500px] h-[500px] rounded-full bg-bridge-accent/[0.03] blur-[120px]"
        />
      )}
      {secondary && (
        <div
          className="absolute bottom-[-10%] right-[5%] w-[400px] h-[400px] rounded-full bg-bridge-secondary/[0.04] blur-[100px]"
        />
      )}
    </div>
  );
}
