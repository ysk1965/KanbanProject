import { useState, useEffect, useCallback } from "react";
import { leaveService } from "../../../utils/services";
import { OrgAttendancePolicySection } from "./OrgAttendancePolicySection";
import { OrgLeavePoliciesSection } from "./OrgLeavePoliciesSection";
import type { LeavePolicy } from "../../../types";

interface OrgSettingsAttendanceSubTabProps {
  orgId: string;
  onLeaveBalanceChange?: () => void;
  hrSystemEnabled?: boolean;
}

export function OrgSettingsAttendanceSubTab({
  orgId,
  onLeaveBalanceChange,
  hrSystemEnabled,
}: OrgSettingsAttendanceSubTabProps) {
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicy[]>([]);

  const fetchPolicies = useCallback(async () => {
    if (hrSystemEnabled) return;
    try {
      const policies = await leaveService.getPolicies(orgId);
      setLeavePolicies(policies);
    } catch (error) {
      console.warn("Failed to fetch leave policies:", error);
    }
  }, [orgId, hrSystemEnabled]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  if (hrSystemEnabled) {
    return (
      <div className="grid grid-cols-1 gap-6 items-start">
        <OrgAttendancePolicySection orgId={orgId} />
      </div>
    );
  }

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
