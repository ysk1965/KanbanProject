import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import type { CollabUser } from '../../hooks/useCollaboration';
import type { CollabStatus } from '../../utils/collabProvider';
import { getInitials } from '../../utils/assigneeColor';

interface CollabPresenceProps {
  status: CollabStatus;
  connectedUsers: CollabUser[];
  currentUserName: string;
  currentUserColor: string;
}

export function CollabPresence({ status, connectedUsers, currentUserName, currentUserColor }: CollabPresenceProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Connected users avatars */}
      <div className="flex items-center -space-x-1.5">
        {/* Current user (always shown) */}
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ring-2 ring-bridge-obsidian"
          style={{ backgroundColor: currentUserColor }}
          title={`${currentUserName} (나)`}
        >
          {getInitials(currentUserName)}
        </div>

        {/* Remote users */}
        {connectedUsers.map((user) => (
          <div
            key={user.clientId}
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ring-2 ring-bridge-obsidian animate-in fade-in duration-300"
            style={{ backgroundColor: user.color }}
            title={user.name}
          >
            {getInitials(user.name)}
          </div>
        ))}
      </div>

      {/* Connection status indicator */}
      {status === 'connected' ? (
        <Wifi size={12} className="text-emerald-500" />
      ) : status === 'connecting' ? (
        <Loader2 size={12} className="text-amber-500 animate-spin" />
      ) : (
        <WifiOff size={12} className="text-red-400" />
      )}
    </div>
  );
}
