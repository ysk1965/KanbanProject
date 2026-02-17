package com.kanban.domain.diary.service;

import com.kanban.domain.diary.*;
import com.kanban.domain.diary.dto.DiaryRequest;
import com.kanban.domain.diary.dto.DiaryResponse;
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
public class DiaryService {

    private static final String[] OPENING_QUESTIONS = {
            "오늘 하루는 어땠나요? 한마디로 표현해본다면?",
            "오늘 가장 기억에 남는 순간이 있었나요?",
            "오늘 하루를 색으로 표현한다면 어떤 색일까요?",
            "오늘 하루 중 감사했던 일이 있나요?",
            "오늘 어떤 기분으로 하루를 보냈나요?"
    };

    private final DiaryEntryRepository diaryEntryRepository;
    private final DiaryMessageRepository diaryMessageRepository;
    private final UserRepository userRepository;
    private final DiaryAIService diaryAIService;

    public DiaryResponse.Detail getDiary(String userId, LocalDate date) {
        DiaryEntry entry = diaryEntryRepository.findByUserIdAndDate(userId, date)
                .orElse(null);
        if (entry == null) {
            return null;
        }
        return DiaryResponse.Detail.of(entry);
    }

    public DiaryResponse.Detail getDiaryById(String userId, String diaryId) {
        DiaryEntry entry = diaryEntryRepository.findById(diaryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.DIARY_NOT_FOUND));
        if (!entry.isOwner(userId)) {
            throw new BusinessException(ErrorCode.DIARY_ACCESS_DENIED);
        }
        return DiaryResponse.Detail.of(entry);
    }

    public List<DiaryResponse.Simple> getDiaryList(String userId, int year, int month) {
        LocalDate startDate = LocalDate.of(year, month, 1);
        LocalDate endDate = startDate.plusMonths(1).minusDays(1);
        return diaryEntryRepository.findByUserIdAndDateRange(userId, startDate, endDate).stream()
                .map(DiaryResponse.Simple::of)
                .toList();
    }

    @Transactional
    public DiaryResponse.Detail createDiary(String userId, DiaryRequest.Create request) {
        if (diaryEntryRepository.existsByUserIdAndDiaryDate(userId, request.getDiaryDate())) {
            throw new BusinessException(ErrorCode.DIARY_ALREADY_EXISTS);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        DiaryEntry entry = DiaryEntry.builder()
                .user(user)
                .diaryDate(request.getDiaryDate())
                .status(DiaryStatus.CHATTING)
                .build();
        diaryEntryRepository.save(entry);

        // AI 첫 질문 메시지 추가
        String openingQuestion = OPENING_QUESTIONS[(int) (Math.random() * OPENING_QUESTIONS.length)];
        DiaryMessage aiMessage = DiaryMessage.builder()
                .diary(entry)
                .role("AI")
                .content(openingQuestion)
                .messageOrder(1)
                .build();
        diaryMessageRepository.save(aiMessage);
        entry.addMessage(aiMessage);

        log.info("Diary created: {} for date: {} by user: {}", entry.getId(), request.getDiaryDate(), userId);
        return DiaryResponse.Detail.of(entry);
    }

    @Transactional
    public DiaryResponse.AiReply sendMessage(String userId, String diaryId, DiaryRequest.SendMessage request) {
        DiaryEntry entry = diaryEntryRepository.findById(diaryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.DIARY_NOT_FOUND));

        if (!entry.isOwner(userId)) {
            throw new BusinessException(ErrorCode.DIARY_ACCESS_DENIED);
        }

        int nextOrder = diaryMessageRepository.findMaxMessageOrder(diaryId) + 1;

        // 사용자 메시지 저장
        DiaryMessage userMessage = DiaryMessage.builder()
                .diary(entry)
                .role("USER")
                .content(request.getContent())
                .messageOrder(nextOrder)
                .build();
        diaryMessageRepository.save(userMessage);

        // AI 응답 생성 (LLM 기반)
        String aiReplyContent = diaryAIService.generateChatReply(entry, request.getContent());
        DiaryMessage aiMessage = DiaryMessage.builder()
                .diary(entry)
                .role("AI")
                .content(aiReplyContent)
                .messageOrder(nextOrder + 1)
                .build();
        diaryMessageRepository.save(aiMessage);

        log.info("Diary message added: diary={}, order={}", diaryId, nextOrder);

        return DiaryResponse.AiReply.builder()
                .diaryId(diaryId)
                .userMessage(DiaryResponse.MessageDetail.of(userMessage))
                .aiMessage(DiaryResponse.MessageDetail.of(aiMessage))
                .build();
    }

    @Transactional
    public DiaryResponse.Detail completeDiary(String userId, String diaryId, DiaryRequest.Complete request) {
        DiaryEntry entry = diaryEntryRepository.findById(diaryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.DIARY_NOT_FOUND));

        if (!entry.isOwner(userId)) {
            throw new BusinessException(ErrorCode.DIARY_ACCESS_DENIED);
        }

        // 대화 내용을 기반으로 AI가 일기 생성
        String finalContent = request.getContent();
        String title = request.getTitle();

        if ((finalContent == null || finalContent.isBlank()) || (title == null || title.isBlank())) {
            DiaryAIService.DiaryContent aiContent = diaryAIService.generateDiaryContent(entry);
            if (finalContent == null || finalContent.isBlank()) {
                finalContent = aiContent.content();
            }
            if (title == null || title.isBlank()) {
                title = aiContent.title();
            }
        }

        entry.complete(title, finalContent, request.getMood());

        log.info("Diary completed: {} by user: {}", diaryId, userId);
        return DiaryResponse.Detail.of(entry);
    }

    @Transactional
    public DiaryResponse.Detail updateDiary(String userId, String diaryId, DiaryRequest.Update request) {
        DiaryEntry entry = diaryEntryRepository.findById(diaryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.DIARY_NOT_FOUND));

        if (!entry.isOwner(userId)) {
            throw new BusinessException(ErrorCode.DIARY_ACCESS_DENIED);
        }

        entry.updateContent(request.getTitle(), request.getContent(), request.getMood());

        log.info("Diary updated: {} by user: {}", diaryId, userId);
        return DiaryResponse.Detail.of(entry);
    }

    @Transactional
    public void deleteDiary(String userId, String diaryId) {
        DiaryEntry entry = diaryEntryRepository.findById(diaryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.DIARY_NOT_FOUND));

        if (!entry.isOwner(userId)) {
            throw new BusinessException(ErrorCode.DIARY_ACCESS_DENIED);
        }

        diaryEntryRepository.delete(entry);
        log.info("Diary deleted: {} by user: {}", diaryId, userId);
    }

}
