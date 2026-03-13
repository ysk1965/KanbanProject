package com.kanban.domain.meeting.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.meeting.MeetingRepository;
import com.kanban.domain.meeting.dto.MeetingResponse;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Separate bean for @Async transcription processing.
 * Spring AOP proxies cannot intercept self-invocations, so the async method
 * must live in a different bean from the caller (MeetingTranscriptionService).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingTranscriptionAsyncService {

    private final MeetingRepository meetingRepository;
    private final AiCreditService aiCreditService;
    private final WebSocketEventService webSocketEventService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;
    private final MeetingTranscriptionService transcriptionService;

    @Async("taskExecutor")
    public void processTranscriptionAsync(String boardId, String meetingId, String userId,
                                          byte[] audioBytes, String originalFilename) {
        int creditsConsumed = 1; // 1 credit already consumed synchronously for Whisper
        User user = userRepository.findById(userId).orElse(null);
        String userName = user != null ? user.getName() : null;

        try {
            // Progress: transcription starting
            transcriptionService.sendProgress(boardId, userId, userName, meetingId, "TRANSCRIBING", 0, 1, 5);

            // Whisper API call (no transaction needed — external HTTP call)
            var whisperSegments = transcriptionService.transcribe(audioBytes, originalFilename,
                    boardId, userId, userName, meetingId);

            String transcriptText = whisperSegments.stream()
                    .map(MeetingTranscriptionService.WhisperSegmentDto::text)
                    .reduce((a, b) -> a + " " + b)
                    .orElse("");

            // AI speaker diarization (no transaction needed — external API call)
            MeetingResponse.DiarizedTranscript diarizedTranscript = null;
            try {
                aiCreditService.consumeCredit(boardId, userId, "MEETING_DIARIZE", 1);
                creditsConsumed++;
                transcriptionService.sendProgress(boardId, userId, userName, meetingId, "DIARIZING", 0, 0, 70);
                diarizedTranscript = transcriptionService.identifySpeakers(boardId, userId, whisperSegments);
            } catch (BusinessException e) {
                if (e.getErrorCode() == ErrorCode.AI_CREDITS_EXHAUSTED) {
                    creditsConsumed--; // Credit wasn't actually consumed
                }
                log.warn("Speaker diarization skipped for meeting: {} - {}", meetingId, e.getMessage());
            } catch (Exception e) {
                log.warn("Speaker diarization failed for meeting: {} - {}", meetingId, e.getMessage());
            }

            // Save to DB (narrow transaction)
            String finalTranscript = saveTranscriptionResult(meetingId, transcriptText, diarizedTranscript);

            // Progress: complete
            transcriptionService.sendProgress(boardId, userId, userName, meetingId, "COMPLETE", 0, 0, 100);

            // Notify other board subscribers
            webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEETING_UPDATED,
                    userId, userName,
                    Map.of("id", meetingId, "transcript", finalTranscript));

            // Send result to the requesting client
            Map<String, Object> resultData = new LinkedHashMap<>();
            resultData.put("meeting_id", meetingId);
            resultData.put("transcript", finalTranscript);
            resultData.put("diarized_transcript", diarizedTranscript);
            webSocketEventService.sendBoardEvent(boardId, BoardEventType.TRANSCRIPTION_COMPLETE,
                    userId, userName, resultData);

        } catch (Exception e) {
            log.error("Async transcription failed for meeting: {} - {}", meetingId, e.getMessage(), e);

            // Refund consumed credits
            try {
                aiCreditService.refundCredit(boardId, userId, "MEETING_TRANSCRIBE_REFUND", creditsConsumed);
                log.info("Refunded {} credits for failed transcription - meeting: {}", creditsConsumed, meetingId);
            } catch (Exception refundEx) {
                log.error("Failed to refund credits for meeting: {} - {}", meetingId, refundEx.getMessage());
            }

            // Send error via WebSocket
            transcriptionService.sendProgress(boardId, userId, userName, meetingId, "ERROR", 0, 0, 0);

            Map<String, Object> errorData = new LinkedHashMap<>();
            errorData.put("meeting_id", meetingId);
            errorData.put("error", e.getMessage() != null ? e.getMessage() : "Transcription failed");
            webSocketEventService.sendBoardEvent(boardId, BoardEventType.TRANSCRIPTION_ERROR,
                    userId, userName, errorData);
        }
    }

    /**
     * Narrow transaction: only holds DB connection for the brief save operation.
     */
    @Transactional
    public String saveTranscriptionResult(String meetingId, String transcriptText,
                                          MeetingResponse.DiarizedTranscript diarizedTranscript) {
        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEETING_NOT_FOUND));

        String existingTranscript = meeting.getTranscript();
        String finalTranscript;
        if (existingTranscript != null && !existingTranscript.isBlank()) {
            finalTranscript = existingTranscript + "\n\n" + transcriptText;
        } else {
            finalTranscript = transcriptText;
        }
        meeting.updateTranscript(finalTranscript);

        if (diarizedTranscript != null) {
            try {
                String diarizedJson = objectMapper.writeValueAsString(diarizedTranscript);
                meeting.updateDiarizedTranscript(diarizedJson);

                if (diarizedTranscript.getSpeakerMapping() != null) {
                    String mappingJson = objectMapper.writeValueAsString(diarizedTranscript.getSpeakerMapping());
                    meeting.updateSpeakerMapping(mappingJson);
                }
            } catch (Exception e) {
                log.error("Failed to serialize diarized transcript: {}", e.getMessage());
            }
        }

        log.info("Transcription saved for meeting: {} ({} chars)", meetingId, transcriptText.length());
        return finalTranscript;
    }
}
