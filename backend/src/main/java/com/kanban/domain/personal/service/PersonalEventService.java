package com.kanban.domain.personal.service;

import com.kanban.domain.personal.PersonalEvent;
import com.kanban.domain.personal.PersonalEventRepository;
import com.kanban.domain.personal.dto.PersonalEventRequest;
import com.kanban.domain.personal.dto.PersonalEventResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PersonalEventService {

    private final PersonalEventRepository personalEventRepository;
    private final UserRepository userRepository;

    public List<PersonalEventResponse.Detail> getEventsByDate(String userId, LocalDate date, String eventType) {
        List<PersonalEvent> events;
        if (eventType != null && !eventType.isBlank()) {
            events = personalEventRepository.findByUserIdAndDateAndEventType(userId, date, eventType);
        } else {
            events = personalEventRepository.findByUserIdAndDate(userId, date);
        }
        return events.stream().map(PersonalEventResponse.Detail::of).toList();
    }

    public List<PersonalEventResponse.Detail> getEventsByDateRange(String userId, LocalDate startDate, LocalDate endDate, String eventType) {
        List<PersonalEvent> events;
        if (eventType != null && !eventType.isBlank()) {
            events = personalEventRepository.findByUserIdAndDateRangeAndEventType(userId, startDate, endDate, eventType);
        } else {
            events = personalEventRepository.findByUserIdAndDateRange(userId, startDate, endDate);
        }
        return events.stream().map(PersonalEventResponse.Detail::of).toList();
    }

    @Transactional
    public PersonalEventResponse.Detail createEvent(String userId, PersonalEventRequest.Create request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        String recurrenceRule = request.getRecurrenceRule();
        String recurrenceGroupId = null;

        if (recurrenceRule != null && !recurrenceRule.isBlank()) {
            recurrenceGroupId = UUID.randomUUID().toString();

            if (request.getRecurrenceEndDate() == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
            }
            if (!request.getRecurrenceEndDate().isAfter(request.getEventDate())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
            }
            LocalDate maxEnd = request.getEventDate().plusDays(365);
            if (request.getRecurrenceEndDate().isAfter(maxEnd)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
            }
            if ("WEEKLY".equals(recurrenceRule)
                    && (request.getRecurrenceDaysOfWeek() == null || request.getRecurrenceDaysOfWeek().isEmpty())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
            }
        }

        String daysOfWeekStr = null;
        if (recurrenceGroupId != null && "WEEKLY".equals(recurrenceRule)
                && request.getRecurrenceDaysOfWeek() != null
                && !request.getRecurrenceDaysOfWeek().isEmpty()) {
            daysOfWeekStr = request.getRecurrenceDaysOfWeek().stream()
                    .map(String::valueOf)
                    .collect(Collectors.joining(","));
        }

        // Build and save first instance
        PersonalEvent firstEvent = buildEvent(user, request, request.getEventDate(),
                recurrenceRule, recurrenceGroupId, daysOfWeekStr, request.getRecurrenceEndDate());
        personalEventRepository.save(firstEvent);

        // Generate remaining recurrence instances
        if (recurrenceGroupId != null) {
            List<PersonalEvent> instances = generateRecurringInstances(
                    user, request, recurrenceRule, recurrenceGroupId,
                    request.getEventDate(), daysOfWeekStr);
            if (!instances.isEmpty()) {
                personalEventRepository.saveAll(instances);
            }
            log.info("Recurring personal event created: group={}, instances={}",
                    recurrenceGroupId, instances.size() + 1);
        } else {
            log.info("Personal event created: {} by user: {}", firstEvent.getId(), userId);
        }

        return PersonalEventResponse.Detail.of(firstEvent);
    }

    @Transactional
    public PersonalEventResponse.Detail updateEvent(String userId, String eventId, PersonalEventRequest.Update request) {
        PersonalEvent event = personalEventRepository.findById(eventId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PERSONAL_EVENT_NOT_FOUND));

        if (!event.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.PERSONAL_ACCESS_DENIED);
        }

        // 반복 설정 변경 처리
        boolean recurrenceChanged = request.getRecurrenceRule() != null || request.getRecurrenceEndDate() != null
                || request.getRecurrenceDaysOfWeek() != null;

        if (recurrenceChanged && event.isRecurring() && "THIS_AND_FUTURE".equals(request.getScope())) {
            return updateRecurrenceThisAndFuture(event, request);
        }

        event.update(
                request.getTitle(),
                request.getDescription(),
                request.getEventDate(),
                request.getStartTime(),
                request.getEndTime(),
                request.getColor(),
                request.getAllDay()
        );

        // 반복 일정의 색상 변경 시 같은 그룹 전체에 적용
        if (request.getColor() != null && event.isRecurring()) {
            List<PersonalEvent> groupEvents = personalEventRepository
                    .findByRecurrenceGroupIdOrderByEventDateAsc(event.getRecurrenceGroupId());
            for (PersonalEvent e : groupEvents) {
                if (!e.getId().equals(eventId)) {
                    e.update(null, null, null, e.getStartTime(), e.getEndTime(), request.getColor(), null);
                }
            }
            log.info("Recurring event color updated for group: {} ({} events)", event.getRecurrenceGroupId(), groupEvents.size());
        }

        log.info("Personal event updated: {} by user: {}", eventId, userId);
        return PersonalEventResponse.Detail.of(event);
    }

    private PersonalEventResponse.Detail updateRecurrenceThisAndFuture(
            PersonalEvent event, PersonalEventRequest.Update request) {

        User user = event.getUser();
        String oldGroupId = event.getRecurrenceGroupId();
        LocalDate fromDate = event.getEventDate();

        // 1) 이 일정 포함 이후 모든 반복 인스턴스 삭제
        personalEventRepository.deleteByRecurrenceGroupIdFromDate(oldGroupId, fromDate);
        personalEventRepository.flush();

        // 2) 새 반복 설정 결정
        String newRule = request.getRecurrenceRule() != null
                ? request.getRecurrenceRule() : event.getRecurrenceRule();
        LocalDate newEndDate = request.getRecurrenceEndDate() != null
                ? request.getRecurrenceEndDate() : event.getRecurrenceEndDate();

        String daysOfWeekStr = null;
        if ("WEEKLY".equals(newRule)) {
            if (request.getRecurrenceDaysOfWeek() != null && !request.getRecurrenceDaysOfWeek().isEmpty()) {
                daysOfWeekStr = request.getRecurrenceDaysOfWeek().stream()
                        .map(String::valueOf)
                        .collect(Collectors.joining(","));
            } else if (event.getRecurrenceDaysOfWeek() != null) {
                daysOfWeekStr = event.getRecurrenceDaysOfWeek();
            }
        }

        // 반복 해제 (빈 문자열)
        if (newRule != null && newRule.isBlank()) {
            PersonalEvent singleEvent = PersonalEvent.builder()
                    .user(user)
                    .title(request.getTitle() != null ? request.getTitle() : event.getTitle())
                    .description(request.getDescription() != null ? request.getDescription() : event.getDescription())
                    .eventDate(fromDate)
                    .startTime(request.getStartTime() != null ? request.getStartTime() : event.getStartTime())
                    .endTime(request.getEndTime() != null ? request.getEndTime() : event.getEndTime())
                    .color(request.getColor() != null ? request.getColor() : event.getColor())
                    .allDay(request.getAllDay() != null ? request.getAllDay() : event.getAllDay())
                    .build();
            personalEventRepository.save(singleEvent);
            log.info("Recurring event converted to single event: group={} from={}", oldGroupId, fromDate);
            return PersonalEventResponse.Detail.of(singleEvent);
        }

        // Validate
        if (newEndDate == null || !newEndDate.isAfter(fromDate)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        LocalDate maxEnd = fromDate.plusDays(365);
        if (newEndDate.isAfter(maxEnd)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        if ("WEEKLY".equals(newRule) && (daysOfWeekStr == null || daysOfWeekStr.isBlank())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        // 3) 새 그룹 ID로 인스턴스 재생성
        String newGroupId = UUID.randomUUID().toString();
        String title = request.getTitle() != null ? request.getTitle() : event.getTitle();
        String desc = request.getDescription() != null ? request.getDescription() : event.getDescription();
        LocalTime startTime = request.getStartTime() != null ? request.getStartTime() : event.getStartTime();
        LocalTime endTime = request.getEndTime() != null ? request.getEndTime() : event.getEndTime();
        String color = request.getColor() != null ? request.getColor() : event.getColor();
        Boolean allDay = request.getAllDay() != null ? request.getAllDay() : event.getAllDay();

        PersonalEvent firstEvent = PersonalEvent.builder()
                .user(user)
                .title(title)
                .description(desc)
                .eventDate(fromDate)
                .startTime(startTime)
                .endTime(endTime)
                .color(color)
                .allDay(allDay != null ? allDay : false)
                .recurrenceRule(newRule)
                .recurrenceGroupId(newGroupId)
                .recurrenceEndDate(newEndDate)
                .recurrenceDaysOfWeek(daysOfWeekStr)
                .build();
        personalEventRepository.save(firstEvent);

        // Generate remaining instances
        List<PersonalEvent> instances = generateRecurringInstancesFromParams(
                user, title, desc, startTime, endTime, color, allDay,
                newRule, newGroupId, fromDate, newEndDate, daysOfWeekStr);
        if (!instances.isEmpty()) {
            personalEventRepository.saveAll(instances);
        }

        log.info("Recurring event recurrence updated: oldGroup={}, newGroup={}, instances={}",
                oldGroupId, newGroupId, instances.size() + 1);
        return PersonalEventResponse.Detail.of(firstEvent);
    }

    private List<PersonalEvent> generateRecurringInstancesFromParams(
            User user, String title, String description,
            LocalTime startTime, LocalTime endTime, String color, Boolean allDay,
            String recurrenceRule, String recurrenceGroupId,
            LocalDate firstDate, LocalDate endDate, String daysOfWeekStr) {

        List<PersonalEvent> instances = new ArrayList<>();

        if ("DAILY".equals(recurrenceRule)) {
            LocalDate current = firstDate.plusDays(1);
            while (!current.isAfter(endDate)) {
                instances.add(buildEventFromParams(user, title, description, current,
                        startTime, endTime, color, allDay,
                        recurrenceRule, recurrenceGroupId, endDate, daysOfWeekStr));
                current = current.plusDays(1);
            }
        } else if ("WEEKLY".equals(recurrenceRule)) {
            List<DayOfWeek> targetDays = parseDaysOfWeek(daysOfWeekStr);
            LocalDate weekStart = firstDate.with(DayOfWeek.MONDAY);

            while (!weekStart.isAfter(endDate)) {
                for (DayOfWeek dow : targetDays) {
                    LocalDate instanceDate = weekStart.with(dow);
                    if (!instanceDate.isAfter(firstDate)) continue;
                    if (instanceDate.isAfter(endDate)) continue;

                    instances.add(buildEventFromParams(user, title, description, instanceDate,
                            startTime, endTime, color, allDay,
                            recurrenceRule, recurrenceGroupId, endDate, daysOfWeekStr));
                }
                weekStart = weekStart.plusWeeks(1);
            }
        }

        return instances;
    }

    private PersonalEvent buildEventFromParams(User user, String title, String description,
                                                LocalDate eventDate, LocalTime startTime, LocalTime endTime,
                                                String color, Boolean allDay, String recurrenceRule,
                                                String recurrenceGroupId, LocalDate recurrenceEndDate,
                                                String daysOfWeekStr) {
        return PersonalEvent.builder()
                .user(user)
                .title(title)
                .description(description)
                .eventDate(eventDate)
                .startTime(startTime)
                .endTime(endTime)
                .color(color != null ? color : "#6366F1")
                .allDay(allDay != null ? allDay : false)
                .recurrenceRule(recurrenceRule)
                .recurrenceGroupId(recurrenceGroupId)
                .recurrenceEndDate(recurrenceEndDate)
                .recurrenceDaysOfWeek(daysOfWeekStr)
                .build();
    }

    @Transactional
    public void deleteEvent(String userId, String eventId, String scope) {
        PersonalEvent event = personalEventRepository.findById(eventId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PERSONAL_EVENT_NOT_FOUND));

        if (!event.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.PERSONAL_ACCESS_DENIED);
        }

        if ("THIS_AND_FUTURE".equals(scope) && event.isRecurring()) {
            personalEventRepository.deleteByRecurrenceGroupIdFromDate(
                    event.getRecurrenceGroupId(), event.getEventDate());
            log.info("Recurring personal events deleted from {}: group={} by user: {}",
                    event.getEventDate(), event.getRecurrenceGroupId(), userId);
        } else {
            personalEventRepository.delete(event);
            log.info("Personal event deleted: {} by user: {}", eventId, userId);
        }
    }

    // ---- Private helpers ----

    private PersonalEvent buildEvent(User user, PersonalEventRequest.Create request,
                                     LocalDate eventDate, String recurrenceRule,
                                     String recurrenceGroupId, String daysOfWeekStr,
                                     LocalDate recurrenceEndDate) {
        return PersonalEvent.builder()
                .user(user)
                .title(request.getTitle())
                .description(request.getDescription())
                .eventDate(eventDate)
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .color(request.getColor() != null ? request.getColor() : "#6366F1")
                .allDay(request.getAllDay() != null ? request.getAllDay() : false)
                .eventType(request.getEventType() != null ? request.getEventType() : "SCHEDULE")
                .recurrenceRule(recurrenceGroupId != null ? recurrenceRule : null)
                .recurrenceGroupId(recurrenceGroupId)
                .recurrenceEndDate(recurrenceGroupId != null ? recurrenceEndDate : null)
                .recurrenceDaysOfWeek(recurrenceGroupId != null ? daysOfWeekStr : null)
                .build();
    }

    private List<PersonalEvent> generateRecurringInstances(
            User user, PersonalEventRequest.Create request,
            String recurrenceRule, String recurrenceGroupId,
            LocalDate firstDate, String daysOfWeekStr) {

        List<PersonalEvent> instances = new ArrayList<>();
        LocalDate endDate = request.getRecurrenceEndDate();

        if ("DAILY".equals(recurrenceRule)) {
            LocalDate current = firstDate.plusDays(1);
            while (!current.isAfter(endDate)) {
                instances.add(buildEvent(user, request, current,
                        recurrenceRule, recurrenceGroupId, daysOfWeekStr, endDate));
                current = current.plusDays(1);
            }
        } else if ("WEEKLY".equals(recurrenceRule)) {
            List<DayOfWeek> targetDays = parseDaysOfWeek(daysOfWeekStr);
            LocalDate weekStart = firstDate.with(DayOfWeek.MONDAY);

            while (!weekStart.isAfter(endDate)) {
                for (DayOfWeek dow : targetDays) {
                    LocalDate instanceDate = weekStart.with(dow);
                    // Skip the first date (already created) and dates outside range
                    if (!instanceDate.isAfter(firstDate)) continue;
                    if (instanceDate.isAfter(endDate)) continue;

                    instances.add(buildEvent(user, request, instanceDate,
                            recurrenceRule, recurrenceGroupId, daysOfWeekStr, endDate));
                }
                weekStart = weekStart.plusWeeks(1);
            }
        }

        return instances;
    }

    private List<DayOfWeek> parseDaysOfWeek(String daysOfWeekStr) {
        if (daysOfWeekStr == null || daysOfWeekStr.isBlank()) return List.of();
        try {
            return Arrays.stream(daysOfWeekStr.split(","))
                    .map(String::trim)
                    .map(Integer::parseInt)
                    .map(this::jsDayToJavaDayOfWeek)
                    .sorted()
                    .toList();
        } catch (Exception e) {
            log.warn("Failed to parse recurrenceDaysOfWeek: {}", daysOfWeekStr);
            return List.of();
        }
    }

    private DayOfWeek jsDayToJavaDayOfWeek(int jsDay) {
        return jsDay == 0 ? DayOfWeek.SUNDAY : DayOfWeek.of(jsDay);
    }
}
