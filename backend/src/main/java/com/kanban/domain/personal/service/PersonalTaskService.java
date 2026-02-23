package com.kanban.domain.personal.service;

import com.kanban.domain.personal.*;
import com.kanban.domain.personal.dto.PersonalTaskRequest;
import com.kanban.domain.personal.dto.PersonalTaskResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PersonalTaskService {

    private final PersonalTaskRepository personalTaskRepository;
    private final UserRepository userRepository;

    // ─── Task CRUD ───

    public List<PersonalTaskResponse.Detail> getTasks(String userId) {
        return personalTaskRepository.findByUserIdWithDetails(userId).stream()
                .map(PersonalTaskResponse.Detail::of)
                .toList();
    }

    public List<PersonalTaskResponse.Detail> getTasksByStatus(String userId, PersonalTaskStatus status) {
        return personalTaskRepository.findByUserIdAndStatus(userId, status).stream()
                .map(PersonalTaskResponse.Detail::of)
                .toList();
    }

    public PersonalTaskResponse.Detail getTask(String userId, String taskId) {
        PersonalTask task = findTaskAndVerifyOwner(userId, taskId);
        return PersonalTaskResponse.Detail.of(task);
    }

    @Transactional
    public PersonalTaskResponse.Detail createTask(String userId, PersonalTaskRequest.Create request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        PersonalTask task = PersonalTask.builder()
                .user(user)
                .title(request.getTitle())
                .description(request.getDescription())
                .priority(request.getPriority() != null ? request.getPriority() : PersonalTaskPriority.MEDIUM)
                .dueDate(request.getDueDate() != null ? request.getDueDate() : LocalDate.now(ZoneOffset.UTC))
                .category(request.getCategory())
                .color(request.getColor())
                .build();

        personalTaskRepository.save(task);
        return PersonalTaskResponse.Detail.of(task);
    }

    @Transactional
    public PersonalTaskResponse.Detail updateTask(String userId, String taskId, PersonalTaskRequest.Update request) {
        PersonalTask task = findTaskAndVerifyOwner(userId, taskId);
        task.update(request.getTitle(), request.getDescription(), request.getPriority(),
                request.getDueDate(), request.getCategory(), request.getColor());
        return PersonalTaskResponse.Detail.of(task);
    }

    @Transactional
    public PersonalTaskResponse.Detail updateTaskStatus(String userId, String taskId, PersonalTaskRequest.StatusUpdate request) {
        PersonalTask task = findTaskAndVerifyOwner(userId, taskId);
        task.updateStatus(request.getStatus());
        return PersonalTaskResponse.Detail.of(task);
    }

    @Transactional
    public void updateTaskPosition(String userId, String taskId, PersonalTaskRequest.PositionUpdate request) {
        PersonalTask task = findTaskAndVerifyOwner(userId, taskId);
        if (request.getStatus() != null) {
            task.updateStatus(request.getStatus());
        }
        task.updatePosition(request.getPosition());
    }

    @Transactional
    public void deleteTask(String userId, String taskId) {
        PersonalTask task = findTaskAndVerifyOwner(userId, taskId);
        personalTaskRepository.delete(task);
    }

    public List<String> getCategories(String userId) {
        return personalTaskRepository.findDistinctCategoriesByUserId(userId);
    }

    // ─── Helpers ───

    private PersonalTask findTaskAndVerifyOwner(String userId, String taskId) {
        PersonalTask task = personalTaskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PERSONAL_TASK_NOT_FOUND));
        if (!task.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.PERSONAL_ACCESS_DENIED);
        }
        return task;
    }
}
