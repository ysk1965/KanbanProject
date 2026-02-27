import { motion } from "framer-motion";

interface OkrProgressBarProps {
  progress: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  animated?: boolean;
}

const sizeMap = {
  sm: "h-1",
  md: "h-1.5",
  lg: "h-2",
};

export function OkrProgressBar({
  progress,
  size = "md",
  className = "",
  animated = true,
}: OkrProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div
      className={`w-full rounded-full bg-foreground/[0.06] overflow-hidden ${sizeMap[size]} ${className}`}
    >
      {animated ? (
        <motion.div
          className="h-full rounded-full bg-bridge-accent"
          initial={{ width: 0 }}
          animate={{ width: `${clampedProgress}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      ) : (
        <div
          className="h-full rounded-full bg-bridge-accent"
          style={{ width: `${clampedProgress}%` }}
        />
      )}
    </div>
  );
}
