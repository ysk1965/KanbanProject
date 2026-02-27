import { useState, useEffect, useCallback } from "react";
import { leaveService } from "../../../utils/services";
import { OrgAttendancePolicySection } from "./OrgAttendancePolicySection";
import { OrgLeavePoliciesSection } from "./OrgLeavePoliciesSection";
import type { LeavePolicy } from "../../../types";

interface OrgSettingsAttendanceSubTabProps {
  orgId: string;
  onLeaveBalanceChange?: () => void;
}

export function OrgSettingsAttendanceSubTab({
  orgId,
  onLeaveBalanceChange,
}: OrgSettingsAttendanceSubTabProps) {
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicy[]>([]);

  const fetchPolicies = useCallback(async () => {
    try {
      const policies = await leaveService.getPolicies(orgId);
      setLeavePolicies(policies);
    } catch (error) {
      console.warn("Failed to fetch leave policies:", error);
    }
  }, [orgId]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <OrgAttendancePolicySection orgId={orgId} />
      <OrgLeavePoliciesSection
        orgId={orgId}
        leavePolicies={leavePolicies}
        onRefresh={() => { fetchPolicies(); onLeaveBalanceChange?.(); }}
      />
    </div>
  );
}
