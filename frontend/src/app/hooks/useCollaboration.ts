import { useState, useEffect, useMemo } from 'react';
import * as Y from 'yjs';
import { CollabProvider, type CollabStatus } from '../utils/collabProvider';
import { getAssigneeHex } from '../utils/assigneeColor';

export interface CollabUser {
  name: string;
  color: string;
  clientId: number;
  mode: 'view' | 'edit';
}

export interface CollaborationState {
  doc: Y.Doc;
  provider: CollabProvider;
  fragment: Y.XmlFragment;
  status: CollabStatus;
  connectedUsers: CollabUser[];
}

interface UseCollaborationOptions {
  noteId: string;
  userName: string;
  userColor?: string;
  enabled?: boolean;
}

export function useCollaboration({
  noteId,
  userName,
  userColor,
  enabled = true,
}: UseCollaborationOptions): CollaborationState | null {
  const [status, setStatus] = useState<CollabStatus>('disconnected');
  const [connectedUsers, setConnectedUsers] = useState<CollabUser[]>([]);
  const color = useMemo(() => userColor || getAssigneeHex(userName), [userName, userColor]);

  // Stable doc + provider per noteId
  const collab = useMemo(() => {
    if (!enabled || !noteId || !userName) return null;
    const doc = new Y.Doc();
    const provider = new CollabProvider(noteId, doc, { name: userName, color });
    const fragment = doc.getXmlFragment('document-store');
    return { doc, provider, fragment };
  }, [noteId, userName, color, enabled]);

  useEffect(() => {
    if (!collab) return;

    const { provider, doc } = collab;

    const removeStatusListener = provider.onStatusChange(setStatus);

    const handleAwarenessChange = () => {
      const states = provider.awareness.getStates();
      const users: CollabUser[] = [];
      states.forEach((state, clientId) => {
        if (clientId === doc.clientID || !state.user) return;
        users.push({
          name: state.user.name,
          color: state.user.color,
          clientId,
          mode: state.mode === 'view' ? 'view' : 'edit',
        });
      });
      setConnectedUsers(users);
    };

    provider.awareness.on('change', handleAwarenessChange);
    provider.connect();

    return () => {
      provider.awareness.off('change', handleAwarenessChange);
      removeStatusListener();
      provider.destroy();
      doc.destroy();
      setConnectedUsers([]);
      setStatus('disconnected');
    };
  }, [collab]);

  if (!collab) return null;

  return {
    doc: collab.doc,
    provider: collab.provider,
    fragment: collab.fragment,
    status,
    connectedUsers,
  };
}
