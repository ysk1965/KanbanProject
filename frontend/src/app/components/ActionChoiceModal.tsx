import { X, Plus, Layers } from 'lucide-react';
import { Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

interface ActionChoiceModalProps {
  startTime: string;
  endTime: string;
  onCreateNew: () => void;
  onConnectExisting: () => void;
  onClose: () => void;
}

export function ActionChoiceModal({
  startTime,
  endTime,
  onCreateNew,
  onConnectExisting,
  onClose,
}: ActionChoiceModalProps) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-bridge-obsidian text-foreground border-white/10 max-w-[400px] p-0 gap-0 [&>button:last-child]:hidden overflow-hidden rounded-2xl">
        <DialogTitle className="sr-only">Action Choice</DialogTitle>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="text-xl font-semibold text-foreground">Action Choice</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Time Display */}
        <div className="px-6 pb-4">
          <div className="bg-bridge-accent/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <Clock className="h-5 w-5 text-bridge-accent" />
            <span className="text-bridge-accent font-medium">
              {startTime} - {endTime}
            </span>
          </div>
        </div>

        {/* Options */}
        <div className="px-6 pb-6 space-y-3">
          {/* Create New */}
          <button
            onClick={onCreateNew}
            className="w-full flex items-center gap-4 p-4 border border-white/10 rounded-xl hover:border-bridge-accent/50 hover:bg-bridge-accent/10 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-bridge-accent/20 flex items-center justify-center group-hover:bg-bridge-accent/30 transition-colors">
              <Plus className="h-6 w-6 text-bridge-accent" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-foreground">Create New Checklist Item</div>
              <div className="text-sm text-slate-400">Add a new task to this time slot</div>
            </div>
          </button>

          {/* Connect Existing */}
          <button
            onClick={onConnectExisting}
            className="w-full flex items-center gap-4 p-4 border border-white/10 rounded-xl hover:border-bridge-accent/50 hover:bg-bridge-accent/10 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-bridge-accent/20 transition-colors">
              <Layers className="h-6 w-6 text-slate-400 group-hover:text-bridge-accent" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-foreground">Connect Existing Item</div>
              <div className="text-sm text-slate-400">Link a task you already created</div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
