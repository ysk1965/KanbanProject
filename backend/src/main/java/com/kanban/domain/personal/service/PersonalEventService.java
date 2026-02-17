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

import java.time.LocalDate;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PersonalEventService {

    private final PersonalEventRepository personalEventRepository;
    private final UserRepository userRepository;

    public List<PersonalEventResponse.Detail> getEventsByDate(String userId, LocalDate date) {
        return personalEventRepository.findByUserIdAndDate(userId, date).stream()
                .map(PersonalEventResponse.Detail::of)
                .toList();
    }

    public List<PersonalEventResponse.Detail> getEventsByDateRange(String userId, LocalDate startDate, LocalDate endDate) {
        return personalEventRepository.findByUserIdAndDateRange(userId, startDate, endDate).stream()
                .map(PersonalEventResponse.Detail::of)
                .toList();
    }

    @Transactional
    public PersonalEventResponse.Detail createEvent(String userId, PersonalEventRequest.Create request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        PersonalEvent event = PersonalEvent.builder()
                .user(user)
                .title(request.getTitle())
                .description(request.getDescription())
                .eventDate(request.getEventDate())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .color(request.getColor() != null ? request.getColor() : "#6366F1")
                .allDay(request.getAllDay() != null ? request.getAllDay() : false)
                .build();
        personalEventRepository.save(event);

        log.info("Personal event created: {} by user: {}", event.getId(), userId);
        return PersonalEventResponse.Detail.of(event);
    }

    @Transactional
    public PersonalEventResponse.Detail updateEvent(String userId, String eventId, PersonalEventRequest.Update request) {
        PersonalEvent event = personalEventRepository.findById(eventId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PERSONAL_EVENT_NOT_FOUND));

        if (!event.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.PERSONAL_ACCESS_DENIED);
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

        log.info("Personal event updated: {} by user: {}", eventId, userId);
        return PersonalEventResponse.Detail.of(event);
    }

    @Transactional
    public void deleteEvent(String userId, String eventId) {
        PersonalEvent event = personalEventRepository.findById(eventId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PERSONAL_EVENT_NOT_FOUND));

        if (!event.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.PERSONAL_ACCESS_DENIED);
        }

        personalEventRepository.delete(event);
        log.info("Personal event deleted: {} by user: {}", eventId, userId);
    }
}
