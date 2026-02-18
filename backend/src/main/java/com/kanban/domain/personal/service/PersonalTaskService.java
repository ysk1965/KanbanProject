package com.kanban.domain.personal.service;

import com.kanban.domain.personal.*;
import com.kanban.domain.personal.dto.PersonalTagRequest;
import com.kanban.domain.personal.dto.PersonalTaskRequest;
import com.kanban.domain.personal.dto.PersonalTaskResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PersonalTaskService {

    private final PersonalTaskRepository personalTaskRepository;
    private final PersonalTaskChecklistRepository checklistRepository;
    private final PersonalTagRepository personalTagRepository;
    private final PersonalTaskTagRepository personalTaskTagRepository;
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
                .priority(request.getPriority() != null ? request.getPriority() : PersonalTaskPriority.NONE)
                .dueDate(request.getDueDate())
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

    // ─── Checklist ───

    @Transactional
    public PersonalTaskResponse.ChecklistItem addChecklist(String userId, String taskId, PersonalTaskRequest.ChecklistCreate request) {
        PersonalTask task = findTaskAndVerifyOwner(userId, taskId);

        int nextPosition = checklistRepository.countByPersonalTaskId(taskId);

        PersonalTaskChecklist checklist = PersonalTaskChecklist.builder()
                .personalTask(task)
                .title(request.getTitle())
                .position(nextPosition)
                .build();

        checklistRepository.save(checklist);
        return PersonalTaskResponse.ChecklistItem.of(checklist);
    }

    @Transactional
    public PersonalTaskResponse.ChecklistItem updateChecklist(String userId, String taskId, String checklistId, PersonalTaskRequest.ChecklistUpdate request) {
        findTaskAndVerifyOwner(userId, taskId);
        PersonalTaskChecklist checklist = checklistRepository.findById(checklistId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PERSONAL_CHECKLIST_NOT_FOUND));
        checklist.update(request.getTitle());
        return PersonalTaskResponse.ChecklistItem.of(checklist);
    }

    @Transactional
    public PersonalTaskResponse.ChecklistItem toggleChecklist(String userId, String taskId, String checklistId) {
        findTaskAndVerifyOwner(userId, taskId);
        PersonalTaskChecklist checklist = checklistRepository.findById(checklistId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PERSONAL_CHECKLIST_NOT_FOUND));
        checklist.toggleCompleted();
        return PersonalTaskResponse.ChecklistItem.of(checklist);
    }

    @Transactional
    public void deleteChecklist(String userId, String taskId, String checklistId) {
        findTaskAndVerifyOwner(userId, taskId);
        checklistRepository.deleteById(checklistId);
    }

    // ─── Tags ───

    public List<PersonalTaskResponse.TagInfo> getTags(String userId) {
        return personalTagRepository.findByUserIdOrderByNameAsc(userId).stream()
                .map(PersonalTaskResponse.TagInfo::of)
                .toList();
    }

    @Transactional
    public PersonalTaskResponse.TagInfo createTag(String userId, PersonalTagRequest.Create request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        if (personalTagRepository.existsByUserIdAndName(userId, request.getName())) {
            throw new BusinessException(ErrorCode.PERSONAL_TAG_DUPLICATE);
        }

        PersonalTag tag = PersonalTag.builder()
                .user(user)
                .name(request.getName())
                .color(request.getColor())
                .build();

        personalTagRepository.save(tag);
        return PersonalTaskResponse.TagInfo.of(tag);
    }

    @Transactional
    public PersonalTaskResponse.TagInfo updateTag(String userId, String tagId, PersonalTagRequest.Update request) {
        PersonalTag tag = findTagAndVerifyOwner(userId, tagId);
        tag.update(request.getName(), request.getColor());
        return PersonalTaskResponse.TagInfo.of(tag);
    }

    @Transactional
    public void deleteTag(String userId, String tagId) {
        PersonalTag tag = findTagAndVerifyOwner(userId, tagId);
        personalTagRepository.delete(tag);
    }

    @Transactional
    public void assignTag(String userId, String taskId, String tagId) {
        PersonalTask task = findTaskAndVerifyOwner(userId, taskId);
        PersonalTag tag = findTagAndVerifyOwner(userId, tagId);

        if (personalTaskTagRepository.existsByPersonalTaskIdAndPersonalTagId(taskId, tagId)) {
            throw new BusinessException(ErrorCode.PERSONAL_TAG_ALREADY_ASSIGNED);
        }

        PersonalTaskTag taskTag = PersonalTaskTag.builder()
                .personalTask(task)
                .personalTag(tag)
                .build();

        personalTaskTagRepository.save(taskTag);
    }

    @Transactional
    public void unassignTag(String userId, String taskId, String tagId) {
        findTaskAndVerifyOwner(userId, taskId);
        findTagAndVerifyOwner(userId, tagId);
        personalTaskTagRepository.deleteByPersonalTaskIdAndPersonalTagId(taskId, tagId);
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

    private PersonalTag findTagAndVerifyOwner(String userId, String tagId) {
        PersonalTag tag = personalTagRepository.findById(tagId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PERSONAL_TAG_NOT_FOUND));
        if (!tag.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.PERSONAL_ACCESS_DENIED);
        }
        return tag;
    }
}
