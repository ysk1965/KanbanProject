package com.kanban.domain.organization.service;

import com.kanban.domain.organization.OrgActivity;
import com.kanban.domain.organization.OrgActivityType;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.dto.OrgActivityResponse;
import com.kanban.domain.organization.repository.OrgActivityRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgActivityService {

    private final OrgActivityRepository orgActivityRepository;
    private final OrganizationService organizationService;

    public OrgActivityResponse.ListResponse getActivities(String orgId, String userId,
                                                           LocalDateTime cursor, int limit) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        List<OrgActivity> items;
        if (cursor != null) {
            items = orgActivityRepository.findByOrgIdWithCursor(orgId, cursor, PageRequest.of(0, limit + 1));
        } else {
            items = orgActivityRepository.findByOrgId(orgId, PageRequest.of(0, limit + 1));
        }

        return OrgActivityResponse.ListResponse.of(items, limit);
    }

    @Transactional
    public void log(Organization org, String actorName, OrgActivityType type,
                    String targetName, Map<String, Object> metadata) {
        OrgActivity activity = OrgActivity.create(org, actorName, type, targetName, metadata);
        orgActivityRepository.save(activity);
        log.info("Org activity logged: {} by {} in org {}", type, actorName, org.getId());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logInNewTransaction(Organization org, String actorName, OrgActivityType type,
                                     String targetName, Map<String, Object> metadata) {
        OrgActivity activity = OrgActivity.create(org, actorName, type, targetName, metadata);
        orgActivityRepository.save(activity);
        log.info("Org activity logged (new tx): {} by {} in org {}", type, actorName, org.getId());
    }
}
