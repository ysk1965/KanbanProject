package com.kanban.domain.meeting.service;

import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.meeting.MeetingRepository;
import com.kanban.domain.meeting.dto.MeetingResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingTranscriptionService {

    private final MeetingRepository meetingRepository;
    private final BoardService boardService;

    @Value("${ai.openai.api-key:}")
    private String openaiApiKey;

    private static final String WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";
    private static final String WHISPER_MODEL = "whisper-1";
    private static final long MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB

    @Transactional
    public MeetingResponse.TranscriptResult transcribeAudio(
            String boardId, String meetingId, String userId,
            MultipartFile audioFile) {

        boardService.checkMemberOrAbove(boardId, userId);

        if (openaiApiKey == null || openaiApiKey.isBlank()) {
            throw new BusinessException(ErrorCode.AI_SERVICE_UNAVAILABLE);
        }

        if (audioFile.isEmpty()) {
            throw new BusinessException(ErrorCode.TRANSCRIPTION_FILE_EMPTY);
        }
        if (audioFile.getSize() > MAX_AUDIO_SIZE) {
            throw new BusinessException(ErrorCode.TRANSCRIPTION_FILE_TOO_LARGE);
        }

        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEETING_NOT_FOUND));
        if (!meeting.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEETING_NOT_FOUND);
        }

        String transcriptText = callWhisperAPI(audioFile);

        String existingTranscript = meeting.getTranscript();
        String finalTranscript;
        if (existingTranscript != null && !existingTranscript.isBlank()) {
            finalTranscript = existingTranscript + "\n\n" + transcriptText;
        } else {
            finalTranscript = transcriptText;
        }
        meeting.updateTranscript(finalTranscript);

        log.info("Transcription completed for meeting: {} ({} chars)", meetingId, transcriptText.length());

        return MeetingResponse.TranscriptResult.builder()
                .meetingId(meetingId)
                .transcript(finalTranscript)
                .build();
    }

    private String callWhisperAPI(MultipartFile audioFile) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);
            headers.setBearerAuth(openaiApiKey);

            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("file", new ByteArrayResource(audioFile.getBytes()) {
                @Override
                public String getFilename() {
                    return audioFile.getOriginalFilename() != null
                            ? audioFile.getOriginalFilename()
                            : "recording.webm";
                }
            });
            body.add("model", WHISPER_MODEL);

            HttpEntity<MultiValueMap<String, Object>> entity = new HttpEntity<>(body, headers);

            RestTemplate whisperRestTemplate = new RestTemplateBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .readTimeout(Duration.ofSeconds(120))
                    .build();

            @SuppressWarnings("unchecked")
            ResponseEntity<Map> response = whisperRestTemplate.postForEntity(
                    WHISPER_API_URL, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object text = response.getBody().get("text");
                if (text != null) {
                    return text.toString();
                }
            }

            throw new BusinessException(ErrorCode.TRANSCRIPTION_FAILED);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Whisper API call failed: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.TRANSCRIPTION_FAILED);
        }
    }
}
