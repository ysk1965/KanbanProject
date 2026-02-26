package com.kanban.domain.organization.service;

import com.kanban.domain.organization.*;
import com.kanban.domain.organization.dto.OnboardingRequest;
import com.kanban.domain.organization.dto.OnboardingResponse;
import com.kanban.domain.organization.repository.*;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgOnboardingService {

    private final OrgOnboardingTemplateRepository templateRepository;
    private final OrgOnboardingInstanceRepository instanceRepository;
    private final OrgOnboardingInstanceItemRepository instanceItemRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final OrgDepartmentRepository orgDepartmentRepository;
    private final OrgJobGroupRepository orgJobGroupRepository;
    private final UserRepository userRepository;
    private final OrganizationService organizationService;
    private final OrgActivityService orgActivityService;

    // ==================== Template CRUD ====================

    public List<OnboardingResponse.TemplateSummary> getTemplates(String orgId, String userId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        List<OrgOnboardingTemplate> templates = templateRepository.findByOrganizationId(orgId);
        return templates.stream()
                .map(OnboardingResponse.TemplateSummary::of)
                .collect(Collectors.toList());
    }

    public OnboardingResponse.TemplateDetail getTemplate(String orgId, String userId, String templateId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrgOnboardingTemplate template = templateRepository.findById(templateId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ONBOARDING_TEMPLATE_NOT_FOUND));
        if (!template.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ONBOARDING_TEMPLATE_NOT_FOUND);
        }
        return OnboardingResponse.TemplateDetail.of(template);
    }

    @Transactional
    public OnboardingResponse.TemplateDetail createTemplate(String orgId, String userId,
                                                             OnboardingRequest.CreateTemplate request) {
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        // Resolve target department / job group
        OrganizationDepartment dept = null;
        if (request.getTargetDepartmentId() != null) {
            dept = orgDepartmentRepository.findByIdAndOrganizationId(request.getTargetDepartmentId(), orgId)
                    .orElse(null);
        }
        OrganizationJobGroup jobGroup = null;
        if (request.getTargetJobGroupId() != null) {
            jobGroup = orgJobGroupRepository.findByIdAndOrganizationId(request.getTargetJobGroupId(), orgId)
                    .orElse(null);
        }

        OrgOnboardingTemplate template = OrgOnboardingTemplate.builder()
                .organization(org)
                .name(request.getName())
                .description(request.getDescription())
                .autoAssign(request.isAutoAssign())
                .targetDepartment(dept)
                .targetJobGroup(jobGroup)
                .build();
        templateRepository.save(template);

        // Create template items
        if (request.getItems() != null) {
            for (int i = 0; i < request.getItems().size(); i++) {
                OnboardingRequest.TemplateItemRequest itemReq = request.getItems().get(i);
                AssigneeRole role = itemReq.getAssigneeRole() != null ?
                        AssigneeRole.valueOf(itemReq.getAssigneeRole()) : null;
                OrgOnboardingTemplateItem item = OrgOnboardingTemplateItem.builder()
                        .template(template)
                        .title(itemReq.getTitle())
                        .description(itemReq.getDescription())
                        .dueDayOffset(itemReq.getDueDayOffset())
                        .assigneeRole(role)
                        .displayOrder(i)
                        .build();
                template.getItems().add(item);
            }
        }

        return OnboardingResponse.TemplateDetail.of(template);
    }

    @Transactional
    public OnboardingResponse.TemplateDetail updateTemplate(String orgId, String userId,
                                                             String templateId,
                                                             OnboardingRequest.UpdateTemplate request) {
        organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        OrgOnboardingTemplate template = templateRepository.findById(templateId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ONBOARDING_TEMPLATE_NOT_FOUND));
        if (!template.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ONBOARDING_TEMPLATE_NOT_FOUND);
        }

        // Resolve target department / job group
        OrganizationDepartment dept = null;
        if (request.getTargetDepartmentId() != null) {
            dept = orgDepartmentRepository.findByIdAndOrganizationId(request.getTargetDepartmentId(), orgId)
                    .orElse(null);
        }
        OrganizationJobGroup jobGroup = null;
        if (request.getTargetJobGroupId() != null) {
            jobGroup = orgJobGroupRepository.findByIdAndOrganizationId(request.getTargetJobGroupId(), orgId)
                    .orElse(null);
        }

        template.update(request.getName(), request.getDescription(), request.isAutoAssign(), dept, jobGroup);

        // Replace items
        template.getItems().clear();
        if (request.getItems() != null) {
            for (int i = 0; i < request.getItems().size(); i++) {
                OnboardingRequest.TemplateItemRequest itemReq = request.getItems().get(i);
                AssigneeRole role = itemReq.getAssigneeRole() != null ?
                        AssigneeRole.valueOf(itemReq.getAssigneeRole()) : null;
                OrgOnboardingTemplateItem item = OrgOnboardingTemplateItem.builder()
                        .template(template)
                        .title(itemReq.getTitle())
                        .description(itemReq.getDescription())
                        .dueDayOffset(itemReq.getDueDayOffset())
                        .assigneeRole(role)
                        .displayOrder(i)
                        .build();
                template.getItems().add(item);
            }
        }

        return OnboardingResponse.TemplateDetail.of(template);
    }

    @Transactional
    public void deleteTemplate(String orgId, String userId, String templateId) {
        organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        OrgOnboardingTemplate template = templateRepository.findById(templateId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ONBOARDING_TEMPLATE_NOT_FOUND));
        if (!template.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ONBOARDING_TEMPLATE_NOT_FOUND);
        }

        templateRepository.delete(template);
    }

    // ==================== Instance Operations ====================

    public List<OnboardingResponse.InstanceSummary> getInstances(String orgId, String userId,
                                                                  OnboardingStatus status, String memberId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        List<OrgOnboardingInstance> instances = instanceRepository.findByOrgIdWithFilters(orgId, status, memberId);
        return instances.stream()
                .map(inst -> {
                    // Find the next incomplete item for the summary
                    OnboardingResponse.NextItem nextItem = inst.getItems().stream()
                            .filter(item -> !item.isCompleted())
                            .findFirst()
                            .map(item -> OnboardingResponse.NextItem.builder()
                                    .title(item.getTitle())
                                    .dueDate(item.getDueDate())
                                    .build())
                            .orElse(null);
                    return OnboardingResponse.InstanceSummary.of(inst, nextItem);
                })
                .collect(Collectors.toList());
    }

    public List<OnboardingResponse.InstanceItemDetail> getInstanceItems(String orgId, String userId,
                                                                         String instanceId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        OrgOnboardingInstance instance = instanceRepository.findById(instanceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ONBOARDING_INSTANCE_NOT_FOUND));
        if (!instance.getOrganization().getId().equals(orgId) || instance.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.ONBOARDING_INSTANCE_NOT_FOUND);
        }

        List<OrgOnboardingInstanceItem> items = instanceItemRepository.findByInstanceId(instanceId);
        return items.stream()
                .map(OnboardingResponse.InstanceItemDetail::of)
                .collect(Collectors.toList());
    }

    @Transactional
    public OnboardingResponse.ToggleResult toggleItem(String orgId, String userId,
                                                       String instanceId, String itemId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // Lock the instance for concurrent safety
        OrgOnboardingInstance instance = instanceRepository.findByIdForUpdate(instanceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ONBOARDING_INSTANCE_NOT_FOUND));
        if (!instance.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ONBOARDING_INSTANCE_NOT_FOUND);
        }

        OrgOnboardingInstanceItem item = instanceItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ONBOARDING_ITEM_NOT_FOUND));
        if (!item.getInstance().getId().equals(instanceId)) {
            throw new BusinessException(ErrorCode.ONBOARDING_ITEM_NOT_FOUND);
        }

        // Toggle completion
        item.toggleComplete(user);

        // Recalculate completed count
        int completedCount = instanceItemRepository.countCompletedByInstanceId(instanceId);
        instance.updateProgress(completedCount);

        // Log activity if onboarding completed
        if (instance.getStatus() == OnboardingStatus.COMPLETED) {
            Organization org = organizationService.getActiveOrgOrThrow(orgId);
            orgActivityService.log(org, instance.getMember().getUser().getName(),
                    OrgActivityType.ONBOARDING_COMPLETED, instance.getTemplateName(), null);
        }

        return OnboardingResponse.ToggleResult.builder()
                .isCompleted(item.isCompleted())
                .completedAt(item.getCompletedAt())
                .instanceProgress(OnboardingResponse.InstanceProgress.builder()
                        .completedItems(instance.getCompletedItems())
                        .totalItems(instance.getTotalItems())
                        .progressPercent(instance.getProgressPercent())
                        .status(instance.getStatus().name())
                        .build())
                .build();
    }

    @Transactional
    public OnboardingResponse.InstanceSummary createInstance(String orgId, String userId,
                                                              OnboardingRequest.CreateInstance request) {
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        OrganizationMember member = orgMemberRepository.findById(request.getMemberId())
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!member.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        OrgOnboardingTemplate template = templateRepository.findById(request.getTemplateId())
                .orElseThrow(() -> new BusinessException(ErrorCode.ONBOARDING_TEMPLATE_NOT_FOUND));
        if (!template.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ONBOARDING_TEMPLATE_NOT_FOUND);
        }

        // Check for duplicate active instance
        if (instanceRepository.existsActiveByMemberAndTemplate(member.getId(), template.getId())) {
            throw new BusinessException(ErrorCode.ONBOARDING_ALREADY_ASSIGNED);
        }

        OrgOnboardingInstance instance = createInstanceFromTemplate(org, member, template);
        return OnboardingResponse.InstanceSummary.of(instance);
    }

    // ==================== Auto-assign (called internally, no auth check) ====================

    @Transactional
    public void autoAssignOnboarding(Organization org, OrganizationMember newMember) {
        try {
            List<OrgOnboardingTemplate> templates = templateRepository.findAutoAssignTemplates(org.getId());

            for (OrgOnboardingTemplate template : templates) {
                // Check if template targets a specific department
                if (template.getTargetDepartment() != null) {
                    if (newMember.getDepartment() == null ||
                        !newMember.getDepartment().getId().equals(template.getTargetDepartment().getId())) {
                        continue;
                    }
                }
                // Check if template targets a specific job group
                if (template.getTargetJobGroup() != null) {
                    if (newMember.getJobGroup() == null ||
                        !newMember.getJobGroup().getId().equals(template.getTargetJobGroup().getId())) {
                        continue;
                    }
                }

                // Skip if already assigned
                if (instanceRepository.existsActiveByMemberAndTemplate(newMember.getId(), template.getId())) {
                    continue;
                }

                createInstanceFromTemplate(org, newMember, template);
                log.info("Auto-assigned onboarding template '{}' to member '{}' in org '{}'",
                        template.getName(), newMember.getUser().getName(), org.getName());
            }
        } catch (Exception e) {
            log.error("Failed to auto-assign onboarding for member '{}' in org '{}': {}",
                    newMember.getId(), org.getId(), e.getMessage(), e);
        }
    }

    // ==================== Private Helpers ====================

    private OrgOnboardingInstance createInstanceFromTemplate(Organization org,
                                                              OrganizationMember member,
                                                              OrgOnboardingTemplate template) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        LocalDate today = LocalDate.now(ZoneOffset.UTC);

        OrgOnboardingInstance instance = OrgOnboardingInstance.builder()
                .organization(org)
                .member(member)
                .sourceTemplate(template)
                .templateName(template.getName())
                .totalItems(template.getItems().size())
                .startedAt(now)
                .build();
        instanceRepository.save(instance);

        List<OrgOnboardingInstanceItem> instanceItems = new ArrayList<>();
        for (OrgOnboardingTemplateItem templateItem : template.getItems()) {
            // Resolve due date from offset
            LocalDate dueDate = null;
            if (templateItem.getDueDayOffset() != null) {
                dueDate = today.plusDays(templateItem.getDueDayOffset());
            }

            // Resolve assignee based on role
            OrganizationMember assignee = null;
            if (templateItem.getAssigneeRole() == AssigneeRole.SELF) {
                assignee = member;
            } else if (templateItem.getAssigneeRole() == AssigneeRole.MANAGER) {
                assignee = member.getManager();
            }

            OrgOnboardingInstanceItem instanceItem = OrgOnboardingInstanceItem.builder()
                    .instance(instance)
                    .title(templateItem.getTitle())
                    .description(templateItem.getDescription())
                    .dueDate(dueDate)
                    .assignee(assignee)
                    .displayOrder(templateItem.getDisplayOrder())
                    .build();
            instanceItems.add(instanceItem);
        }
        instanceItemRepository.saveAll(instanceItems);
        instance.getItems().addAll(instanceItems);

        return instance;
    }
}
