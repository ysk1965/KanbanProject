package com.kanban.domain.meeting.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.meeting.MeetingRepository;
import com.kanban.domain.meeting.dto.MeetingResponse;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.config.AIProvider;
import com.kanban.global.config.AIResponse;
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
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingTranscriptionService {

    private final MeetingRepository meetingRepository;
    private final BoardService boardService;
    private final AiCreditService aiCreditService;
    private final WebSocketEventService webSocketEventService;
    private final UserRepository userRepository;
    private final AIProvider aiProvider;
    private final ObjectMapper objectMapper;
    private final AiUsageLogRepository aiUsageLogRepository;

    @Value("${ai.openai.api-key:}")
    private String openaiApiKey;

    @Value("${app.file.video.ffmpeg-path:/usr/bin/ffmpeg}")
    private String ffmpegPath;

    @Value("${ai.provider:claude}")
    private String provider;

    @Value("${ai.claude.model.meeting:claude-haiku-4-5-20251001}")
    private String claudeMeetingModel;

    @Value("${ai.openai.model.meeting:gpt-4o-mini}")
    private String openaiMeetingModel;

    private static final String WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";
    private static final String WHISPER_MODEL = "whisper-1";
    private static final long MAX_AUDIO_SIZE = 100 * 1024 * 1024; // 100MB
    private static final long WHISPER_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB (Whisper API limit with margin)
    private static final int CHUNK_DURATION_SECONDS = 600; // 10분 단위로 분할
    private static final int MAX_TOKENS_DIARIZE = 4096;

    private static final String DIARIZE_SYSTEM_PROMPT = """
            You are a meeting transcript analyzer. Given a raw meeting transcript, identify different speakers and format it as a structured dialogue.

            Rules:
            1. Label speakers as "화자 1", "화자 2", etc.
            2. Split the transcript at natural speaker change points (topic shifts, responses, agreements)
            3. Each segment should contain one speaker's continuous speech
            4. Preserve the original text exactly - do not modify, translate, or correct
            5. If speaker changes are unclear, use best judgment based on context

            Output ONLY valid JSON (no markdown):
            {
              "segments": [
                { "speaker": "화자 1", "text": "...", "order": 0 },
                { "speaker": "화자 2", "text": "...", "order": 1 }
              ],
              "speaker_mapping": { "화자 1": null, "화자 2": null }
            }
            """;

    private String getMeetingModel() {
        return "openai".equals(provider) ? openaiMeetingModel : claudeMeetingModel;
    }

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

        // Consume 1 AI credit for Whisper transcription
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

        // AI speaker diarization post-processing (consume 1 additional credit)
        MeetingResponse.DiarizedTranscript diarizedTranscript = null;
        try {
            aiCreditService.consumeCredit(boardId, userId, "MEETING_DIARIZE", 1);
            diarizedTranscript = identifySpeakers(boardId, userId, finalTranscript);

            if (diarizedTranscript != null) {
                String diarizedJson = objectMapper.writeValueAsString(diarizedTranscript);
                meeting.updateDiarizedTranscript(diarizedJson);

                // Initialize speaker_mapping as JSON
                if (diarizedTranscript.getSpeakerMapping() != null) {
                    String mappingJson = objectMapper.writeValueAsString(diarizedTranscript.getSpeakerMapping());
                    meeting.updateSpeakerMapping(mappingJson);
                }

                log.info("Speaker diarization completed for meeting: {} ({} segments)",
                        meetingId, diarizedTranscript.getSegments() != null ? diarizedTranscript.getSegments().size() : 0);
            }
        } catch (BusinessException e) {
            // If credit exhausted for diarization, still return transcript without diarization
            log.warn("Speaker diarization skipped for meeting: {} - {}", meetingId, e.getMessage());
        } catch (Exception e) {
            log.warn("Speaker diarization failed for meeting: {} - {}", meetingId, e.getMessage());
        }

        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEETING_UPDATED,
                userId, user != null ? user.getName() : null,
                Map.of("id", meetingId, "transcript", finalTranscript));

        return MeetingResponse.TranscriptResult.builder()
                .meetingId(meetingId)
                .transcript(finalTranscript)
                .diarizedTranscript(diarizedTranscript)
                .build();
    }

    /**
     * AI-based speaker diarization: identifies speakers in raw transcript text
     */
    private MeetingResponse.DiarizedTranscript identifySpeakers(String boardId, String userId, String transcriptText) {
        String truncatedText = transcriptText.length() > 8000
                ? transcriptText.substring(0, 8000) + "..."
                : transcriptText;

        String userPrompt = "Meeting transcript:\n\n" + truncatedText;
        String model = getMeetingModel();

        AIResponse aiResult = aiProvider.chatWithUsage(DIARIZE_SYSTEM_PROMPT, userPrompt, model, MAX_TOKENS_DIARIZE);

        // Log AI usage
        try {
            aiUsageLogRepository.save(AiUsageLog.builder()
                    .boardId(boardId).userId(userId)
                    .featureType("MEETING_DIARIZE").provider(provider.toUpperCase())
                    .model(model)
                    .inputTokens(aiResult.inputTokens())
                    .outputTokens(aiResult.outputTokens())
                    .estimatedCostUsd(AiUsageLog.calculateCost(model, aiResult.inputTokens(), aiResult.outputTokens()))
                    .build());
        } catch (Exception e) {
            log.debug("Failed to save AI usage log for diarization: {}", e.getMessage());
        }

        return parseDiarizedResponse(aiResult.content());
    }

    /**
     * Parse AI response into DiarizedTranscript DTO
     */
    private MeetingResponse.DiarizedTranscript parseDiarizedResponse(String aiResponse) {
        try {
            String json = extractJson(aiResponse);
            JsonNode root = objectMapper.readTree(json);

            List<MeetingResponse.DiarizedSegment> segments = new ArrayList<>();
            JsonNode segmentsNode = root.get("segments");
            if (segmentsNode != null && segmentsNode.isArray()) {
                for (JsonNode segNode : segmentsNode) {
                    String speaker = segNode.has("speaker") ? segNode.get("speaker").asText() : "화자 ?";
                    String text = segNode.has("text") ? segNode.get("text").asText() : "";
                    int order = segNode.has("order") ? segNode.get("order").asInt() : segments.size();

                    segments.add(MeetingResponse.DiarizedSegment.builder()
                            .speaker(speaker)
                            .text(text)
                            .order(order)
                            .build());
                }
            }

            Map<String, String> speakerMapping = new LinkedHashMap<>();
            JsonNode mappingNode = root.get("speaker_mapping");
            if (mappingNode != null && mappingNode.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> fields = mappingNode.fields();
                while (fields.hasNext()) {
                    Map.Entry<String, JsonNode> entry = fields.next();
                    speakerMapping.put(entry.getKey(),
                            entry.getValue().isNull() ? null : entry.getValue().asText());
                }
            }

            return MeetingResponse.DiarizedTranscript.builder()
                    .segments(segments)
                    .speakerMapping(speakerMapping)
                    .build();

        } catch (JsonProcessingException e) {
            log.error("Failed to parse diarized transcript response: {}", e.getMessage(), e);
            return null;
        }
    }

    private String extractJson(String response) {
        if (response == null) return "{}";
        String trimmed = response.trim();

        // Strip markdown code fences if present
        if (trimmed.startsWith("```")) {
            int firstNewline = trimmed.indexOf('\n');
            int lastFence = trimmed.lastIndexOf("```");
            if (firstNewline > 0 && lastFence > firstNewline) {
                trimmed = trimmed.substring(firstNewline + 1, lastFence).trim();
            }
        }

        // Find first { and last }
        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return trimmed.substring(start, end + 1);
        }

        return trimmed;
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
