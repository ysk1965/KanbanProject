import { useState, useEffect, useCallback } from "react";
import { organizationService } from "../../../utils/services";
import { OnboardingTemplatesSection } from "../OnboardingTemplatesSection";
import { OrgAnniversarySettingsSection } from "./OrgAnniversarySettingsSection";
import type { OrgDepartment, OrgJobGroup } from "../../../types";

interface OrgSettingsOnboardingSubTabProps {
  orgId: string;
}

export function OrgSettingsOnboardingSubTab({
  orgId,
}: OrgSettingsOnboardingSubTabProps) {
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [jobGroups, setJobGroups] = useState<OrgJobGroup[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [depts, jgs] = await Promise.all([
        organizationService.getDepartments(orgId),
        organizationService.getJobGroups(orgId),
      ]);
      setDepartments(depts);
      setJobGroups(jgs);
    } catch (error) {
      console.warn("Failed to fetch org data:", error);
    }
  }, [orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <OnboardingTemplatesSection
        orgId={orgId}
        departments={departments}
        jobGroups={jobGroups}
      />
      <OrgAnniversarySettingsSection orgId={orgId} />
    </div>
  );
}
