import { motion, AnimatePresence } from "framer-motion";
import type { OkrObjective } from "../../../types";
import { OkrObjectiveNode } from "./OkrObjectiveNode";

interface OkrChildrenRowProps {
  objectives: OkrObjective[];
  collapsedNodes: Set<string>;
  onToggle: (id: string) => void;
  onObjectiveClick: (id: string) => void;
  onCheckIn: (krId: string) => void;
  onAddChild: (parentId: string) => void;
  isAdmin: boolean;
}

export function OkrChildrenRow({
  objectives,
  collapsedNodes,
  onToggle,
  onObjectiveClick,
  onCheckIn,
  onAddChild,
  isAdmin,
}: OkrChildrenRowProps) {
  const count = objectives.length;
  if (count === 0) return null;

  return (
    <div className="relative">
      {/* Horizontal connector line */}
      {count > 1 && (
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2"
          style={{
            width: `calc(100% - ${100 / count}%)`,
            height: "1px",
          }}
        >
          <div className="absolute inset-0 bg-foreground/10" />
        </div>
      )}

      {/* Child nodes */}
      <div className="flex justify-center gap-3 md:gap-6">
        {objectives.map((obj) => {
          const isCollapsed = collapsedNodes.has(obj.id);
          const hasChildren = obj.children && obj.children.length > 0;

          return (
            <div
              key={obj.id}
              className="flex flex-col items-center"
              style={{ minWidth: "220px" }}
            >
              {/* Vertical connector (above node) */}
              <div className="w-px h-4 bg-foreground/10" />

              {/* Node card */}
              <OkrObjectiveNode
                objective={obj}
                isCollapsed={isCollapsed}
                onToggle={() => onToggle(obj.id)}
                onObjectiveClick={onObjectiveClick}
                onCheckIn={onCheckIn}
                onAddChild={onAddChild}
                isAdmin={isAdmin}
              />

              {/* Recursive children */}
              <AnimatePresence>
                {hasChildren && !isCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center overflow-hidden"
                  >
                    <div className="flex flex-col items-center pb-4">
                      <div className="w-px h-6 bg-foreground/10 mt-3" />
                      <OkrChildrenRow
                        objectives={obj.children}
                        collapsedNodes={collapsedNodes}
                        onToggle={onToggle}
                        onObjectiveClick={onObjectiveClick}
                        onCheckIn={onCheckIn}
                        onAddChild={onAddChild}
                        isAdmin={isAdmin}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
