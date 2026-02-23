package com.kanban.domain.meeting.service;

import com.kanban.domain.board.service.BoardService;
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

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingTranscriptionService {

    private final MeetingRepository meetingRepository;
    private final BoardService boardService;
    private final AiCreditService aiCreditService;
    private final WebSocketEventService webSocketEventService;
    private final UserRepository userRepository;

    @Value("${ai.openai.api-key:}")
    private String openaiApiKey;

    @Value("${app.file.video.ffmpeg-path:/usr/bin/ffmpeg}")
    private String ffmpegPath;

    private static final String WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";
    private static final String WHISPER_MODEL = "whisper-1";
    private static final long MAX_AUDIO_SIZE = 100 * 1024 * 1024; // 100MB
    private static final long WHISPER_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB (Whisper API limit with margin)
    private static final int CHUNK_DURATION_SECONDS = 600; // 10분 단위로 분할

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

        // Consume 1 AI credit before calling Whisper API
        aiCreditService.consumeCredit(boardId, userId, "MEETING_TRANSCRIBE", 1);

        String transcriptText;
        if (audioFile.getSize() <= WHISPER_CHUNK_SIZE) {
            transcriptText = callWhisperAPI(audioFile);
        } else {
            transcriptText = splitAndTranscribe(audioFile);
        }

        String existingTranscript = meeting.getTranscript();
        String finalTranscript;
        if (existingTranscript != null && !existingTranscript.isBlank()) {
            finalTranscript = existingTranscript + "\n\n" + transcriptText;
        } else {
            finalTranscript = transcriptText;
        }
        meeting.updateTranscript(finalTranscript);

        log.info("Transcription completed for meeting: {} ({} chars)", meetingId, transcriptText.length());

        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEETING_UPDATED,
                userId, user != null ? user.getName() : null,
                Map.of("id", meetingId, "transcript", finalTranscript));

        return MeetingResponse.TranscriptResult.builder()
                .meetingId(meetingId)
                .transcript(finalTranscript)
                .build();
    }

    private String splitAndTranscribe(MultipartFile audioFile) {
        Path tempDir = null;
        Path tempInput = null;
        try {
            tempDir = Files.createTempDirectory("audio_split_");
            String extension = ".webm";
            String originalName = audioFile.getOriginalFilename();
            if (originalName != null && originalName.contains(".")) {
                extension = originalName.substring(originalName.lastIndexOf("."));
            }
            tempInput = tempDir.resolve("input" + extension);
            audioFile.transferTo(tempInput.toFile());

            // FFmpeg로 청크 분할
            String chunkPattern = tempDir.resolve("chunk_%03d" + extension).toString();
            ProcessBuilder pb = new ProcessBuilder(
                    ffmpegPath, "-i", tempInput.toString(),
                    "-f", "segment", "-segment_time", String.valueOf(CHUNK_DURATION_SECONDS),
                    "-c", "copy", "-y", chunkPattern
            );
            pb.redirectErrorStream(true);
            Process process = pb.start();
            String ffmpegOutput = new String(process.getInputStream().readAllBytes());
            int exitCode = process.waitFor();

            if (exitCode != 0) {
                log.error("FFmpeg split failed (exit {}): {}", exitCode, ffmpegOutput);
                throw new BusinessException(ErrorCode.TRANSCRIPTION_FAILED);
            }

            // 청크 파일 수집 및 순차 전사
            List<Path> chunks = new ArrayList<>();
            for (int i = 0; ; i++) {
                Path chunk = tempDir.resolve(String.format("chunk_%03d%s", i, extension));
                if (!Files.exists(chunk)) break;
                chunks.add(chunk);
            }

            if (chunks.isEmpty()) {
                throw new BusinessException(ErrorCode.TRANSCRIPTION_FAILED);
            }

            log.info("Audio split into {} chunks for transcription", chunks.size());

            StringBuilder fullTranscript = new StringBuilder();
            for (int i = 0; i < chunks.size(); i++) {
                Path chunk = chunks.get(i);
                byte[] chunkBytes = Files.readAllBytes(chunk);
                String chunkText = callWhisperAPIWithBytes(chunkBytes, "chunk_" + i + extension);
                if (fullTranscript.length() > 0) {
                    fullTranscript.append(" ");
                }
                fullTranscript.append(chunkText);
                log.info("Chunk {}/{} transcribed ({} chars)", i + 1, chunks.size(), chunkText.length());
            }

            return fullTranscript.toString();

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Audio split and transcribe failed: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.TRANSCRIPTION_FAILED);
        } finally {
            cleanupTempFiles(tempDir);
        }
    }

    private void cleanupTempFiles(Path tempDir) {
        if (tempDir == null) return;
        try {
            Files.walk(tempDir)
                    .sorted((a, b) -> b.compareTo(a))
                    .forEach(path -> {
                        try { Files.deleteIfExists(path); } catch (IOException ignored) {}
                    });
        } catch (IOException e) {
            log.warn("Failed to cleanup temp files: {}", e.getMessage());
        }
    }

    private String callWhisperAPI(MultipartFile audioFile) {
        try {
            return callWhisperAPIWithBytes(audioFile.getBytes(),
                    audioFile.getOriginalFilename() != null ? audioFile.getOriginalFilename() : "recording.webm");
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Whisper API call failed: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.TRANSCRIPTION_FAILED);
        }
    }

    private String callWhisperAPIWithBytes(byte[] audioBytes, String filename) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);
            headers.setBearerAuth(openaiApiKey);

            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("file", new ByteArrayResource(audioBytes) {
                @Override
                public String getFilename() {
                    return filename;
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
