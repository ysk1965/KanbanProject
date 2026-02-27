package com.kanban.domain.organization.service;

import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.domain.organization.*;
import com.kanban.domain.organization.dto.OneOnOneRequest;
import com.kanban.domain.organization.dto.OneOnOneResponse;
import com.kanban.domain.organization.repository.*;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgOneOnOneService {

    private final OrgOneOnOneRepository oneOnOneRepository;
    private final OrgOneOnOneMeetingRepository meetingRepository;
    private final OrgOneOnOneActionItemRepository actionItemRepository;
    private final OrgMemberRepository memberRepository;
    private final UserRepository userRepository;

    // --- 1:1 관계 CRUD ---

    public List<OneOnOneResponse.Summary> getOneOnOnes(String orgId, String userId) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        List<OrgOneOnOne> list;
        if (me.isAdminOrAbove()) {
            list = oneOnOneRepository.findAllByOrgId(orgId);
        } else {
            list = oneOnOneRepository.findByOrgIdAndMemberId(orgId, me.getId());
        }

        return list.stream()
                .map(o -> {
                    long count = meetingRepository.countByOneOnOneId(o.getId());
                    return OneOnOneResponse.Summary.from(o, count);
                })
                .toList();
    }

    @Transactional
    public OneOnOneResponse.Summary createOneOnOne(String orgId, String userId, OneOnOneRequest.Create request) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        OrganizationMember other = memberRepository.findById(request.getMemberBId())
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        // Verify other member belongs to the same organization
        if (!other.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        // member_a_id < member_b_id ordering
        OrganizationMember memberA, memberB;
        if (me.getId().compareTo(other.getId()) < 0) {
            memberA = me;
            memberB = other;
        } else {
            memberA = other;
            memberB = me;
        }

        // Check existing
        if (oneOnOneRepository.existsByMembers(orgId, memberA.getId(), memberB.getId())) {
            throw new BusinessException(ErrorCode.ONE_ON_ONE_ALREADY_EXISTS);
        }

        OneOnOneRecurrenceType recurrenceType = null;
        if (request.getRecurrenceType() != null && !request.getRecurrenceType().isBlank()) {
            recurrenceType = OneOnOneRecurrenceType.valueOf(request.getRecurrenceType());
        }

        OrgOneOnOne oneOnOne = OrgOneOnOne.builder()
                .organization(me.getOrganization())
                .memberA(memberA)
                .memberB(memberB)
                .recurrenceType(recurrenceType)
                .recurrenceDay(request.getRecurrenceDay())
                .build();

        oneOnOneRepository.save(oneOnOne);
        return OneOnOneResponse.Summary.from(oneOnOne, 0);
    }

    @Transactional
    public OneOnOneResponse.Summary updateOneOnOne(String orgId, String userId, String oneOnOneId,
                                                     OneOnOneRequest.Update request) {
        OrgOneOnOne oneOnOne = getOneOnOneWithPermission(oneOnOneId, orgId, userId);

        OneOnOneRecurrenceType recurrenceType = null;
        if (request.getRecurrenceType() != null && !request.getRecurrenceType().isBlank()) {
            recurrenceType = OneOnOneRecurrenceType.valueOf(request.getRecurrenceType());
        }

        LocalDate nextDate = null;
        if (request.getNextMeetingDate() != null && !request.getNextMeetingDate().isBlank()) {
            nextDate = LocalDate.parse(request.getNextMeetingDate());
        }

        oneOnOne.updateRecurrence(recurrenceType, request.getRecurrenceDay(), nextDate);

        long count = meetingRepository.countByOneOnOneId(oneOnOne.getId());
        return OneOnOneResponse.Summary.from(oneOnOne, count);
    }

    @Transactional
    public void deleteOneOnOne(String orgId, String userId, String oneOnOneId) {
        OrgOneOnOne oneOnOne = getOneOnOneWithPermission(oneOnOneId, orgId, userId);
        oneOnOne.softDelete();
    }

    // --- 미팅 노트 CRUD ---

    public OneOnOneResponse.MeetingListResponse getMeetings(String orgId, String userId, String oneOnOneId,
                                                             String cursor, int size) {
        getOneOnOneWithPermission(oneOnOneId, orgId, userId);

        List<OrgOneOnOneMeeting> meetings;
        if (cursor != null && !cursor.isBlank()) {
            meetings = meetingRepository.findByOneOnOneIdWithCursor(oneOnOneId, cursor, PageRequest.of(0, size + 1));
        } else {
            meetings = meetingRepository.findByOneOnOneId(oneOnOneId, PageRequest.of(0, size + 1));
        }

        boolean hasMore = meetings.size() > size;
        if (hasMore) {
            meetings = meetings.subList(0, size);
        }

        String nextCursor = hasMore && !meetings.isEmpty() ? meetings.get(meetings.size() - 1).getId() : null;

        return OneOnOneResponse.MeetingListResponse.builder()
                .meetings(meetings.stream().map(OneOnOneResponse.MeetingDetail::from).toList())
                .nextCursor(nextCursor)
                .hasMore(hasMore)
                .build();
    }

    @Transactional
    public OneOnOneResponse.MeetingDetail createMeeting(String orgId, String userId, String oneOnOneId,
                                                         OneOnOneRequest.CreateMeeting request) {
        OrgOneOnOne oneOnOne = getOneOnOneWithPermission(oneOnOneId, orgId, userId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        OrgOneOnOneMeeting meeting = OrgOneOnOneMeeting.builder()
                .oneOnOne(oneOnOne)
                .meetingDate(LocalDate.parse(request.getMeetingDate()))
                .agenda(request.getAgenda())
                .notes(request.getNotes())
                .createdBy(user)
                .build();

        meetingRepository.save(meeting);

        // Add action items
        if (request.getActionItems() != null) {
            for (int i = 0; i < request.getActionItems().size(); i++) {
                OneOnOneRequest.ActionItemInput input = request.getActionItems().get(i);
                OrganizationMember assignee = null;
                if (input.getAssigneeId() != null && !input.getAssigneeId().isBlank()) {
                    assignee = memberRepository.findById(input.getAssigneeId()).orElse(null);
                }
                OrgOneOnOneActionItem actionItem = OrgOneOnOneActionItem.builder()
                        .meeting(meeting)
                        .title(input.getTitle())
                        .assignee(assignee)
                        .displayOrder(i)
                        .build();
                meeting.getActionItems().add(actionItem);
            }
        }

        return OneOnOneResponse.MeetingDetail.from(meeting);
    }

    @Transactional
    public OneOnOneResponse.MeetingDetail updateMeeting(String orgId, String userId, String oneOnOneId,
                                                         String meetingId, OneOnOneRequest.UpdateMeeting request) {
        getOneOnOneWithPermission(oneOnOneId, orgId, userId);

        OrgOneOnOneMeeting meeting = meetingRepository.findByIdWithDetails(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ONE_ON_ONE_MEETING_NOT_FOUND));

        LocalDate meetingDate = request.getMeetingDate() != null ? LocalDate.parse(request.getMeetingDate()) : meeting.getMeetingDate();
        meeting.update(meetingDate, request.getAgenda(), request.getNotes());

        // Replace action items if provided
        if (request.getActionItems() != null) {
            meeting.getActionItems().clear();
            for (int i = 0; i < request.getActionItems().size(); i++) {
                OneOnOneRequest.ActionItemInput input = request.getActionItems().get(i);
                OrganizationMember assignee = null;
                if (input.getAssigneeId() != null && !input.getAssigneeId().isBlank()) {
                    assignee = memberRepository.findById(input.getAssigneeId()).orElse(null);
                }
                OrgOneOnOneActionItem actionItem = OrgOneOnOneActionItem.builder()
                        .meeting(meeting)
                        .title(input.getTitle())
                        .assignee(assignee)
                        .displayOrder(i)
                        .build();
                meeting.getActionItems().add(actionItem);
            }
        }

        return OneOnOneResponse.MeetingDetail.from(meeting);
    }

    @Transactional
    public void deleteMeeting(String orgId, String userId, String oneOnOneId, String meetingId) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        OrgOneOnOneMeeting meeting = meetingRepository.findByIdWithDetails(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ONE_ON_ONE_MEETING_NOT_FOUND));

        // Only creator or admin can delete
        if (!meeting.getCreatedBy().getId().equals(userId) && !me.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ACCESS_DENIED);
        }

        meeting.softDelete();
    }

    // --- 액션 아이템 ---

    @Transactional
    public OneOnOneResponse.ActionItemDetail toggleActionItem(String orgId, String userId, String oneOnOneId,
                                                               String actionId) {
        getOneOnOneWithPermission(oneOnOneId, orgId, userId);

        OrgOneOnOneActionItem item = actionItemRepository.findByIdWithAssignee(actionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ONE_ON_ONE_ACTION_ITEM_NOT_FOUND));

        item.toggleComplete();
        return OneOnOneResponse.ActionItemDetail.from(item);
    }

    public List<OneOnOneResponse.OpenActionItem> getOpenActionItems(String orgId, String userId, String oneOnOneId) {
        getOneOnOneWithPermission(oneOnOneId, orgId, userId);

        List<OrgOneOnOneActionItem> items = actionItemRepository.findOpenByOneOnOneId(oneOnOneId);
        return items.stream()
                .map(OneOnOneResponse.OpenActionItem::from)
                .toList();
    }

    // --- Helper ---

    private OrgOneOnOne getOneOnOneWithPermission(String oneOnOneId, String orgId, String userId) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        OrgOneOnOne oneOnOne = oneOnOneRepository.findByIdWithMembers(oneOnOneId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ONE_ON_ONE_NOT_FOUND));

        if (!oneOnOne.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_ACCESS_DENIED);
        }

        // Participant or admin
        if (!oneOnOne.isParticipant(me.getId()) && !me.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ACCESS_DENIED);
        }

        return oneOnOne;
    }

    // For MemberDetailModal: find or check existing 1:1 between current user and target member
    public OneOnOneResponse.Summary findByMembers(String orgId, String userId, String targetMemberId) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        OrganizationMember target = memberRepository.findById(targetMemberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        // Verify target belongs to the same organization
        if (!target.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        return oneOnOneRepository.findByOrgIdAndUserIds(orgId, me.getUser().getId(), target.getUser().getId())
                .map(o -> {
                    // Verify requesting user is a participant or admin
                    if (!o.isParticipant(me.getId()) && !me.isAdminOrAbove()) {
                        throw new BusinessException(ErrorCode.ORG_ACCESS_DENIED);
                    }
                    long count = meetingRepository.countByOneOnOneId(o.getId());
                    return OneOnOneResponse.Summary.from(o, count);
                })
                .orElse(null);
    }
}
