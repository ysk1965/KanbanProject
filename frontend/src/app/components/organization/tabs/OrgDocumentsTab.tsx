import { NotesView } from '../../notes/NotesView';
import type { OrgRole } from '../../../types';

interface OrgDocumentsTabProps {
  orgId: string;
  role: OrgRole;
}

export function OrgDocumentsTab({ orgId, role }: OrgDocumentsTabProps) {
  const currentUserRole = role === 'MEMBER' ? 'member' : 'admin';
  return <NotesView orgId={orgId} currentUserRole={currentUserRole} />;
}
