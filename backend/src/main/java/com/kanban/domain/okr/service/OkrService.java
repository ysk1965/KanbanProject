package com.kanban.domain.okr.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.okr.OkrCheckIn;
import com.kanban.domain.okr.OkrCycle;
import com.kanban.domain.okr.OkrKeyResult;
import com.kanban.domain.okr.OkrObjective;
import com.kanban.domain.okr.dto.*;
import com.kanban.domain.okr.repository.OkrCheckInRepository;
import com.kanban.domain.okr.repository.OkrCycleRepository;
import com.kanban.domain.okr.repository.OkrKeyResultRepository;
import com.kanban.domain.okr.repository.OkrObjectiveRepository;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.OrganizationDepartment;
import com.kanban.domain.organization.OrganizationMember;
import com.kanban.domain.organization.repository.OrgDepartmentRepository;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.organization.repository.OrganizationRepository;
import com.kanban.domain.organization.service.OrganizationService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OkrService {

    private final OkrCycleRepository okrCycleRepository;
    private final OkrObjectiveRepository okrObjectiveRepository;
    private final OkrKeyResultRepository okrKeyResultRepository;
    private final OkrCheckInRepository okrCheckInRepository;
    private final OrganizationRepository organizationRepository;
    private final OrganizationService organizationService;
    private final OrgMemberRepository orgMemberRepository;
    private final OrgDepartmentRepository orgDepartmentRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final OkrProgressCalculator progressCalculator;

    // ===== Cycle CRUD =====

    public List<OkrCycleResponse.Detail> getCycles(String orgId, String userId) {
        checkMemberAccess(orgId, userId);
        return okrCycleRepository.findByOrganizationIdOrderByStartDateDesc(orgId).stream()
                .map(OkrCycleResponse.Detail::of)
                .collect(Collectors.toList());
    }

    @Transactional
    public OkrCycleResponse.Detail createCycle(String orgId, String userId, OkrCycleRequest.Create request) {
        OrganizationMember member = checkMemberAccess(orgId, userId);
        checkAdminAccess(member);

        Organization org = organizationRepository.findById(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_NOT_FOUND));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        OkrCycle cycle = OkrCycle.builder()
                .organization(org)
                .name(request.getName())
                .cycleType(request.getCycleType())
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .status("PLANNING")
                .createdBy(user)
                .build();
        okrCycleRepository.save(cycle);

        log.info("OKR cycle created: orgId={}, cycleId={}, userId={}", orgId, cycle.getId(), userId);
        return OkrCycleResponse.Detail.of(cycle);
    }

    @Transactional
    public OkrCycleResponse.Detail updateCycle(String orgId, String cycleId, String userId, OkrCycleRequest.Update request) {
        OrganizationMember member = checkMemberAccess(orgId, userId);
        checkAdminAccess(member);

        OkrCycle cycle = okrCycleRepository.findByIdAndOrganizationId(cycleId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OKR_CYCLE_NOT_FOUND));

        cycle.updateInfo(request.getName(), request.getCycleType(), request.getStartDate(), request.getEndDate());
        if (request.getStatus() != null) {
            cycle.updateStatus(request.getStatus());
        }

        log.info("OKR cycle updated: orgId={}, cycleId={}, userId={}", orgId, cycleId, userId);
        return OkrCycleResponse.Detail.of(cycle);
    }

    @Transactional
    public void deleteCycle(String orgId, String cycleId, String userId) {
        OrganizationMember member = checkMemberAccess(orgId, userId);
        checkAdminAccess(member);

        OkrCycle cycle = okrCycleRepository.findByIdAndOrganizationId(cycleId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OKR_CYCLE_NOT_FOUND));

        // Delete all related data: checkins → key results → objectives → cycle
        List<OkrObjective> objectives = okrObjectiveRepository.findByCycleIdOrderBySortOrderAsc(cycleId);
        List<String> objectiveIds = objectives.stream().map(OkrObjective::getId).collect(Collectors.toList());

        if (!objectiveIds.isEmpty()) {
            List<OkrKeyResult> keyResults = okrKeyResultRepository.findByObjectiveIdInWithOwner(objectiveIds);
            for (OkrKeyResult kr : keyResults) {
                List<OkrCheckIn> checkIns = okrCheckInRepository.findByKeyResultIdOrderByCreatedAtDesc(kr.getId());
                okrCheckInRepository.deleteAll(checkIns);
            }
            okrKeyResultRepository.deleteAll(keyResults);
        }
        okrObjectiveRepository.deleteAll(objectives);
        okrCycleRepository.delete(cycle);

        log.info("OKR cycle deleted: orgId={}, cycleId={}, userId={}", orgId, cycleId, userId);
    }

    // ===== Tree Query =====

    public OkrTreeResponse getTree(String orgId, String cycleId, String userId) {
        checkMemberAccess(orgId, userId);

        OkrCycle cycle = okrCycleRepository.findByIdAndOrganizationId(cycleId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OKR_CYCLE_NOT_FOUND));

        // 1. Fetch all objectives with details (owner, department, parent)
        List<OkrObjective> objectives = okrObjectiveRepository.findByCycleIdWithDetails(cycleId);
        List<String> objectiveIds = objectives.stream().map(OkrObjective::getId).collect(Collectors.toList());

        // 2. Fetch all key results with owners
        List<OkrKeyResult> keyResults = objectiveIds.isEmpty()
                ? Collections.emptyList()
                : okrKeyResultRepository.findByObjectiveIdInWithOwner(objectiveIds);

        // 3. Group KRs by objective ID
        Map<String, List<OkrKeyResult>> krsByObjectiveId = keyResults.stream()
                .collect(Collectors.groupingBy(kr -> kr.getObjective().getId()));

        // 4. Calculate progress for each objective
        for (OkrObjective obj : objectives) {
            List<OkrKeyResult> objKrs = krsByObjectiveId.getOrDefault(obj.getId(), Collections.emptyList());
            int progress = progressCalculator.calculateObjectiveProgress(objKrs);
            obj.updateProgress(progress);
        }

        // 5. Build objective map for tree construction
        Map<String, OkrObjective> objectiveMap = objectives.stream()
                .collect(Collectors.toMap(OkrObjective::getId, o -> o));

        // 6. Build tree: separate root vs child objectives
        Map<String, List<OkrObjective>> childrenByParentId = new LinkedHashMap<>();
        List<OkrObjective> rootObjectives = new ArrayList<>();

        for (OkrObjective obj : objectives) {
            if (obj.getParentObjective() == null) {
                rootObjectives.add(obj);
            } else {
                childrenByParentId
                        .computeIfAbsent(obj.getParentObjective().getId(), k -> new ArrayList<>())
                        .add(obj);
            }
        }

        // 7. Build tree nodes recursively
        List<OkrTreeResponse.ObjectiveNode> rootNodes = rootObjectives.stream()
                .map(obj -> buildObjectiveNode(obj, krsByObjectiveId, childrenByParentId))
                .collect(Collectors.toList());

        // 8. Calculate overall progress (company-level objectives)
        List<OkrObjective> companyObjectives = objectives.stream()
                .filter(o -> "COMPANY".equals(o.getLevel()))
                .collect(Collectors.toList());
        int overallProgress = progressCalculator.calculateOverallProgress(companyObjectives);

        return OkrTreeResponse.builder()
                .cycle(OkrTreeResponse.CycleInfo.builder()
                        .id(cycle.getId())
                        .name(cycle.getName())
                        .status(cycle.getStatus())
                        .startDate(cycle.getStartDate().toString())
                        .endDate(cycle.getEndDate().toString())
                        .build())
                .overallProgress(overallProgress)
                .totalObjectives(objectives.size())
                .totalKeyResults(keyResults.size())
                .objectives(rootNodes)
                .build();
    }

    private OkrTreeResponse.ObjectiveNode buildObjectiveNode(
            OkrObjective obj,
            Map<String, List<OkrKeyResult>> krsByObjectiveId,
            Map<String, List<OkrObjective>> childrenByParentId) {

        List<OkrKeyResult> krs = krsByObjectiveId.getOrDefault(obj.getId(), Collections.emptyList());
        List<OkrTreeResponse.KeyResultNode> krNodes = krs.stream()
                .map(kr -> OkrTreeResponse.KeyResultNode.builder()
                        .id(kr.getId())
                        .title(kr.getTitle())
                        .metricType(kr.getMetricType())
                        .startValue(kr.getStartValue())
                        .targetValue(kr.getTargetValue())
                        .currentValue(kr.getCurrentValue())
                        .unit(kr.getUnit())
                        .owner(OkrObjectiveResponse.MemberInfo.of(kr.getOwner()))
                        .weight(kr.getWeight())
                        .linkedBoardId(kr.getLinkedBoard() != null ? kr.getLinkedBoard().getId() : null)
                        .lastCheckinAt(null) // Tree query doesn't fetch individual checkin timestamps
                        .build())
                .collect(Collectors.toList());

        List<OkrObjective> children = childrenByParentId.getOrDefault(obj.getId(), Collections.emptyList());
        List<OkrTreeResponse.ObjectiveNode> childNodes = children.stream()
                .map(child -> buildObjectiveNode(child, krsByObjectiveId, childrenByParentId))
                .collect(Collectors.toList());

        return OkrTreeResponse.ObjectiveNode.builder()
                .id(obj.getId())
                .title(obj.getTitle())
                .description(obj.getDescription())
                .level(obj.getLevel())
                .departmentId(obj.getDepartment() != null ? obj.getDepartment().getId() : null)
                .departmentName(obj.getDepartment() != null ? obj.getDepartment().getName() : null)
                .owner(OkrObjectiveResponse.MemberInfo.of(obj.getOwner()))
                .progress(obj.getProgress())
                .confidence(obj.getConfidence())
                .sortOrder(obj.getSortOrder())
                .keyResults(krNodes)
                .children(childNodes)
                .build();
    }

    // ===== Objective CRUD =====

    @Transactional
    public OkrObjectiveResponse.Detail createObjective(String orgId, String cycleId, String userId,
                                                        OkrObjectiveRequest.Create request) {
        OrganizationMember member = checkMemberAccess(orgId, userId);

        Organization org = organizationRepository.findById(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_NOT_FOUND));

        OkrCycle cycle = okrCycleRepository.findByIdAndOrganizationId(cycleId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OKR_CYCLE_NOT_FOUND));

        // Resolve department
        OrganizationDepartment department = null;
        if (request.getDepartmentId() != null) {
            department = orgDepartmentRepository.findByIdAndOrganizationId(request.getDepartmentId(), orgId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.ORG_DEPARTMENT_NOT_FOUND));
        }

        // Resolve owner
        OrganizationMember owner = null;
        if (request.getOwnerId() != null) {
            owner = orgMemberRepository.findByOrganizationIdAndUserId(orgId, request.getOwnerId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        }

        // Resolve parent objective
        OkrObjective parentObjective = null;
        if (request.getParentObjectiveId() != null) {
            parentObjective = okrObjectiveRepository.findByIdAndOrganizationId(request.getParentObjectiveId(), orgId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.OKR_OBJECTIVE_NOT_FOUND));
        }

        // Calculate sortOrder: max sortOrder + 1 among siblings
        List<OkrObjective> siblings = okrObjectiveRepository.findByCycleIdOrderBySortOrderAsc(cycleId);
        int maxSortOrder = siblings.stream()
                .filter(o -> {
                    String parentId = o.getParentObjective() != null ? o.getParentObjective().getId() : null;
                    return Objects.equals(parentId, request.getParentObjectiveId());
                })
                .mapToInt(OkrObjective::getSortOrder)
                .max()
                .orElse(-1);

        OkrObjective objective = OkrObjective.builder()
                .cycle(cycle)
                .organization(org)
                .title(request.getTitle())
                .description(request.getDescription())
                .level(request.getLevel())
                .department(department)
                .owner(owner)
                .parentObjective(parentObjective)
                .progress(0)
                .confidence("ON_TRACK")
                .sortOrder(maxSortOrder + 1)
                .build();
        okrObjectiveRepository.save(objective);

        log.info("OKR objective created: orgId={}, cycleId={}, objectiveId={}, userId={}",
                orgId, cycleId, objective.getId(), userId);
        return OkrObjectiveResponse.Detail.of(objective);
    }

    @Transactional
    public OkrObjectiveResponse.Detail updateObjective(String orgId, String objectiveId, String userId,
                                                        OkrObjectiveRequest.Update request) {
        checkMemberAccess(orgId, userId);

        OkrObjective objective = okrObjectiveRepository.findByIdAndOrganizationId(objectiveId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OKR_OBJECTIVE_NOT_FOUND));

        // Resolve department
        OrganizationDepartment department = null;
        if (request.getDepartmentId() != null) {
            department = orgDepartmentRepository.findByIdAndOrganizationId(request.getDepartmentId(), orgId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.ORG_DEPARTMENT_NOT_FOUND));
        }

        // Resolve owner
        OrganizationMember owner = null;
        if (request.getOwnerId() != null) {
            owner = orgMemberRepository.findByOrganizationIdAndUserId(orgId, request.getOwnerId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        }

        // Resolve parent objective
        OkrObjective parentObjective = null;
        if (request.getParentObjectiveId() != null) {
            parentObjective = okrObjectiveRepository.findByIdAndOrganizationId(request.getParentObjectiveId(), orgId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.OKR_OBJECTIVE_NOT_FOUND));
        }

        objective.updateInfo(request.getTitle(), request.getDescription(), request.getLevel(),
                department, owner, parentObjective);

        log.info("OKR objective updated: orgId={}, objectiveId={}, userId={}", orgId, objectiveId, userId);
        return OkrObjectiveResponse.Detail.of(objective);
    }

    @Transactional
    public void deleteObjective(String orgId, String objectiveId, String userId) {
        OrganizationMember member = checkMemberAccess(orgId, userId);
        checkAdminAccess(member);

        OkrObjective objective = okrObjectiveRepository.findByIdAndOrganizationId(objectiveId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OKR_OBJECTIVE_NOT_FOUND));

        // Delete key results and their checkins
        List<OkrKeyResult> keyResults = okrKeyResultRepository.findByObjectiveId(objectiveId);
        for (OkrKeyResult kr : keyResults) {
            List<OkrCheckIn> checkIns = okrCheckInRepository.findByKeyResultIdOrderByCreatedAtDesc(kr.getId());
            okrCheckInRepository.deleteAll(checkIns);
        }
        okrKeyResultRepository.deleteAll(keyResults);

        // Delete child objectives recursively
        deleteChildObjectives(orgId, objectiveId);

        okrObjectiveRepository.delete(objective);

        log.info("OKR objective deleted: orgId={}, objectiveId={}, userId={}", orgId, objectiveId, userId);
    }

    private void deleteChildObjectives(String orgId, String parentObjectiveId) {
        List<OkrObjective> allObjectives = okrObjectiveRepository.findByCycleIdOrderBySortOrderAsc(
                okrObjectiveRepository.findByIdAndOrganizationId(parentObjectiveId, orgId)
                        .map(o -> o.getCycle().getId()).orElse(""));
        List<OkrObjective> children = allObjectives.stream()
                .filter(o -> o.getParentObjective() != null
                        && parentObjectiveId.equals(o.getParentObjective().getId()))
                .collect(Collectors.toList());

        for (OkrObjective child : children) {
            // Recursively delete children
            deleteChildObjectives(orgId, child.getId());

            // Delete key results and checkins
            List<OkrKeyResult> krs = okrKeyResultRepository.findByObjectiveId(child.getId());
            for (OkrKeyResult kr : krs) {
                List<OkrCheckIn> checkIns = okrCheckInRepository.findByKeyResultIdOrderByCreatedAtDesc(kr.getId());
                okrCheckInRepository.deleteAll(checkIns);
            }
            okrKeyResultRepository.deleteAll(krs);
            okrObjectiveRepository.delete(child);
        }
    }

    // ===== Key Result CRUD =====

    @Transactional
    public OkrKeyResultResponse.Detail createKeyResult(String orgId, String objectiveId, String userId,
                                                        OkrKeyResultRequest.Create request) {
        OrganizationMember member = checkMemberAccess(orgId, userId);

        OkrObjective objective = okrObjectiveRepository.findByIdAndOrganizationId(objectiveId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OKR_OBJECTIVE_NOT_FOUND));

        // Resolve owner
        OrganizationMember owner = null;
        if (request.getOwnerId() != null) {
            owner = orgMemberRepository.findByOrganizationIdAndUserId(orgId, request.getOwnerId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        }

        // Resolve linked board
        Board linkedBoard = null;
        if (request.getLinkedBoardId() != null) {
            linkedBoard = boardRepository.findById(request.getLinkedBoardId()).orElse(null);
        }

        // Calculate sortOrder
        List<OkrKeyResult> existingKrs = okrKeyResultRepository.findByObjectiveIdOrderBySortOrderAsc(objectiveId);
        int maxSortOrder = existingKrs.stream()
                .mapToInt(OkrKeyResult::getSortOrder)
                .max()
                .orElse(-1);

        OkrKeyResult keyResult = OkrKeyResult.builder()
                .objective(objective)
                .title(request.getTitle())
                .description(request.getDescription())
                .metricType(request.getMetricType())
                .startValue(request.getStartValue())
                .targetValue(request.getTargetValue())
                .currentValue(request.getCurrentValue())
                .unit(request.getUnit())
                .owner(owner)
                .weight(request.getWeight() != null ? request.getWeight() : 1.0)
                .linkedBoard(linkedBoard)
                .sortOrder(maxSortOrder + 1)
                .build();
        okrKeyResultRepository.save(keyResult);

        log.info("OKR key result created: orgId={}, objectiveId={}, krId={}, userId={}",
                orgId, objectiveId, keyResult.getId(), userId);
        return OkrKeyResultResponse.Detail.of(keyResult);
    }

    @Transactional
    public OkrKeyResultResponse.Detail updateKeyResult(String orgId, String krId, String userId,
                                                        OkrKeyResultRequest.Update request) {
        checkMemberAccess(orgId, userId);

        OkrKeyResult keyResult = okrKeyResultRepository.findById(krId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OKR_KEY_RESULT_NOT_FOUND));

        // Verify the KR belongs to this org
        if (!keyResult.getObjective().getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.OKR_KEY_RESULT_NOT_FOUND);
        }

        // Resolve owner
        OrganizationMember owner = null;
        if (request.getOwnerId() != null) {
            owner = orgMemberRepository.findByOrganizationIdAndUserId(orgId, request.getOwnerId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        }

        // Resolve linked board
        Board linkedBoard = null;
        if (request.getLinkedBoardId() != null) {
            linkedBoard = boardRepository.findById(request.getLinkedBoardId()).orElse(null);
        }

        keyResult.updateInfo(request.getTitle(), request.getDescription(), request.getMetricType(),
                request.getStartValue(), request.getTargetValue(), request.getUnit(),
                owner, request.getWeight(), linkedBoard);

        // Recalculate progress after update
        recalculateProgress(keyResult.getObjective());

        log.info("OKR key result updated: orgId={}, krId={}, userId={}", orgId, krId, userId);
        return OkrKeyResultResponse.Detail.of(keyResult);
    }

    @Transactional
    public void deleteKeyResult(String orgId, String krId, String userId) {
        OrganizationMember member = checkMemberAccess(orgId, userId);
        checkAdminAccess(member);

        OkrKeyResult keyResult = okrKeyResultRepository.findById(krId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OKR_KEY_RESULT_NOT_FOUND));

        // Verify the KR belongs to this org
        if (!keyResult.getObjective().getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.OKR_KEY_RESULT_NOT_FOUND);
        }

        OkrObjective objective = keyResult.getObjective();

        // Delete checkins
        List<OkrCheckIn> checkIns = okrCheckInRepository.findByKeyResultIdOrderByCreatedAtDesc(krId);
        okrCheckInRepository.deleteAll(checkIns);

        okrKeyResultRepository.delete(keyResult);

        // Recalculate progress after deletion
        recalculateProgress(objective);

        log.info("OKR key result deleted: orgId={}, krId={}, userId={}", orgId, krId, userId);
    }

    // ===== Check-In =====

    public List<OkrCheckInResponse.Detail> getCheckIns(String orgId, String krId, String userId) {
        checkMemberAccess(orgId, userId);

        OkrKeyResult keyResult = okrKeyResultRepository.findById(krId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OKR_KEY_RESULT_NOT_FOUND));

        if (!keyResult.getObjective().getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.OKR_KEY_RESULT_NOT_FOUND);
        }

        return okrCheckInRepository.findByKeyResultIdWithAuthor(krId).stream()
                .map(OkrCheckInResponse.Detail::of)
                .collect(Collectors.toList());
    }

    @Transactional
    public OkrCheckInResponse.Detail createCheckIn(String orgId, String krId, String userId,
                                                    OkrCheckInRequest.Create request) {
        OrganizationMember member = checkMemberAccess(orgId, userId);

        OkrKeyResult keyResult = okrKeyResultRepository.findById(krId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OKR_KEY_RESULT_NOT_FOUND));

        if (!keyResult.getObjective().getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.OKR_KEY_RESULT_NOT_FOUND);
        }

        // Create check-in
        OkrCheckIn checkIn = OkrCheckIn.builder()
                .keyResult(keyResult)
                .previousValue(keyResult.getCurrentValue())
                .newValue(request.getNewValue())
                .confidence(request.getConfidence())
                .note(request.getNote())
                .author(member)
                .build();
        okrCheckInRepository.save(checkIn);

        // Update KR current value
        keyResult.updateCurrentValue(request.getNewValue());

        // Update objective confidence based on latest check-in
        OkrObjective objective = keyResult.getObjective();
        objective.updateConfidence(request.getConfidence());

        // Recalculate progress: KR → Objective → Parent Objectives
        recalculateProgress(objective);

        log.info("OKR check-in created: orgId={}, krId={}, checkInId={}, userId={}",
                orgId, krId, checkIn.getId(), userId);
        return OkrCheckInResponse.Detail.of(checkIn);
    }

    // ===== Helper: Progress Rollup =====

    private void recalculateProgress(OkrObjective objective) {
        List<OkrKeyResult> krs = okrKeyResultRepository.findByObjectiveId(objective.getId());
        int progress = progressCalculator.calculateObjectiveProgress(krs);
        objective.updateProgress(progress);
        okrObjectiveRepository.save(objective);

        // Rollup to parent if exists
        if (objective.getParentObjective() != null) {
            recalculateParentProgress(objective.getParentObjective());
        }
    }

    private void recalculateParentProgress(OkrObjective parent) {
        List<OkrObjective> allInCycle = okrObjectiveRepository
                .findByCycleIdOrderBySortOrderAsc(parent.getCycle().getId());
        List<OkrObjective> children = allInCycle.stream()
                .filter(o -> o.getParentObjective() != null
                        && parent.getId().equals(o.getParentObjective().getId()))
                .collect(Collectors.toList());

        if (!children.isEmpty()) {
            int avgProgress = (int) Math.round(children.stream()
                    .mapToInt(OkrObjective::getProgress)
                    .average().orElse(0));
            parent.updateProgress(avgProgress);
            okrObjectiveRepository.save(parent);
        }

        if (parent.getParentObjective() != null) {
            recalculateParentProgress(parent.getParentObjective());
        }
    }

    // ===== Helper: Access Control =====

    private OrganizationMember checkMemberAccess(String orgId, String userId) {
        return organizationService.getOrgMemberOrThrow(orgId, userId);
    }

    private void checkAdminAccess(OrganizationMember member) {
        if (!member.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.OKR_UNAUTHORIZED);
        }
    }
}
