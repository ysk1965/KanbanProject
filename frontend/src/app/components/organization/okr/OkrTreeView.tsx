import { useState } from "react";
import type { OkrObjective } from "../../../types";
import { OkrObjectiveNode } from "./OkrObjectiveNode";
import { OkrChildrenRow } from "./OkrChildrenRow";

interface OkrTreeViewProps {
  objectives: OkrObjective[];
  onObjectiveClick: (id: string) => void;
  onCheckIn: (krId: string) => void;
  onAddChild: (parentId: string) => void;
  isAdmin: boolean;
}

export function OkrTreeView({
  objectives,
  onObjectiveClick,
  onCheckIn,
  onAddChild,
  isAdmin,
}: OkrTreeViewProps) {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  const toggleNode = (id: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (objectives.length === 0) return null;

  return (
    <div className="overflow-x-auto pb-8">
      <div className="flex flex-col items-center min-w-fit px-4">
        {objectives.length === 1 ? (
          <SingleRootTree
            objective={objectives[0]}
            collapsedNodes={collapsedNodes}
            onToggle={toggleNode}
            onObjectiveClick={onObjectiveClick}
            onCheckIn={onCheckIn}
            onAddChild={onAddChild}
            isAdmin={isAdmin}
          />
        ) : (
          <>
            {/* Vertical connector from virtual root */}
            <div className="w-px h-6 bg-foreground/10" />
            <OkrChildrenRow
              objectives={objectives}
              collapsedNodes={collapsedNodes}
              onToggle={toggleNode}
              onObjectiveClick={onObjectiveClick}
              onCheckIn={onCheckIn}
              onAddChild={onAddChild}
              isAdmin={isAdmin}
            />
          </>
        )}
      </div>
    </div>
  );
}

// Single root + subtree renderer
function SingleRootTree({
  objective,
  collapsedNodes,
  onToggle,
  onObjectiveClick,
  onCheckIn,
  onAddChild,
  isAdmin,
}: {
  objective: OkrObjective;
  collapsedNodes: Set<string>;
  onToggle: (id: string) => void;
  onObjectiveClick: (id: string) => void;
  onCheckIn: (krId: string) => void;
  onAddChild: (parentId: string) => void;
  isAdmin: boolean;
}) {
  const isCollapsed = collapsedNodes.has(objective.id);
  const hasChildren = objective.children && objective.children.length > 0;

  return (
    <>
      <OkrObjectiveNode
        objective={objective}
        isCollapsed={isCollapsed}
        onToggle={() => onToggle(objective.id)}
        onObjectiveClick={onObjectiveClick}
        onCheckIn={onCheckIn}
        onAddChild={onAddChild}
        isAdmin={isAdmin}
      />
      {hasChildren && !isCollapsed && (
        <>
          <div className="w-px h-6 bg-foreground/10" />
          <OkrChildrenRow
            objectives={objective.children}
            collapsedNodes={collapsedNodes}
            onToggle={onToggle}
            onObjectiveClick={onObjectiveClick}
            onCheckIn={onCheckIn}
            onAddChild={onAddChild}
            isAdmin={isAdmin}
          />
        </>
      )}
    </>
  );
}
