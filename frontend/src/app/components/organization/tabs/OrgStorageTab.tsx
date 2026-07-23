import { StorageView } from "../../storage/StorageView";

interface OrgStorageTabProps {
  orgId: string;
}

/** 조직 스코프 스토리지 탭. (OrgDocumentsTab → NotesView 구조 미러) */
export function OrgStorageTab({ orgId }: OrgStorageTabProps) {
  return <StorageView orgId={orgId} />;
}
