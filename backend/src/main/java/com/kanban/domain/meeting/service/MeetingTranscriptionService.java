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
import java.util.concurrent.TimeUnit;

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
    private static final int MAX_TOKENS_DIARIZE = 16384;
    private static final int MAX_DIARIZE_INPUT_CHARS = 50000;
    private static final int WHISPER_MAX_RETRIES = 3;
    private static final long WHISPER_RETRY_DELAY_MS = 2000;

    private record WhisperSegment(double start, double end, String text) {}

    private static final String DIARIZE_SYSTEM_PROMPT = """
            You are a meeting transcript analyzer. Given a timestamped meeting transcript, identify different speakers and format it as a structured dialogue.

            The input contains segments with timestamps [MM:SS.s - MM:SS.s] and pause durations between them.

            Rules:
            1. Label speakers as "화자 1", "화자 2", etc.
            2. Use PAUSE duration as the primary signal for speaker changes:
               - Pauses >= 0.8s strongly suggest a speaker change
               - Pauses < 0.3s usually mean the same speaker continues
            3. Also consider content cues: questions followed by answers, topic shifts, agreements, different speech styles
            4. Each segment should contain one speaker's continuous speech
            5. Preserve the original text exactly - do not modify, translate, or correct
            6. When merging consecutive segments by the same speaker, concatenate their text with a space

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

        User user = userRepository.findById(userId).orElse(null);
        String userName = user != null ? user.getName() : null;

        // Progress: transcription starting
        sendProgress(boardId, userId, userName, meetingId, "TRANSCRIBING", 0, 1, 5);

        List<WhisperSegment> whisperSegments;
        if (audioFile.getSize() <= WHISPER_CHUNK_SIZE) {
            whisperSegments = callWhisperAPI(audioFile);
            sendProgress(boardId, userId, userName, meetingId, "TRANSCRIBING", 1, 1, 65);
        } else {
            whisperSegments = splitAndTranscribe(audioFile, boardId, userId, userName, meetingId);
        }

        String transcriptText = whisperSegments.stream()
                .map(WhisperSegment::text)
                .reduce((a, b) -> a + " " + b)
                .orElse("");

        String existingTranscript = meeting.getTranscript();
        String finalTranscript;
        if (existingTranscript != null && !existingTranscript.isBlank()) {
            finalTranscript = existingTranscript + "\n\n" + transcriptText;
        } else {
            finalTranscript = transcriptText;
        }
        meeting.updateTranscript(finalTranscript);

        log.info("Transcription completed for meeting: {} ({} chars, {} segments)",
                meetingId, transcriptText.length(), whisperSegments.size());

        // AI speaker diarization post-processing (consume 1 additional credit)
        MeetingResponse.DiarizedTranscript diarizedTranscript = null;
        try {
            aiCreditService.consumeCredit(boardId, userId, "MEETING_DIARIZE", 1);
            sendProgress(boardId, userId, userName, meetingId, "DIARIZING", 0, 0, 70);
            diarizedTranscript = identifySpeakers(boardId, userId, whisperSegments);

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

        // Progress: complete
        sendProgress(boardId, userId, userName, meetingId, "COMPLETE", 0, 0, 100);

        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEETING_UPDATED,
                userId, userName,
                Map.of("id", meetingId, "transcript", finalTranscript));

        return MeetingResponse.TranscriptResult.builder()
                .meetingId(meetingId)
                .transcript(finalTranscript)
                .diarizedTranscript(diarizedTranscript)
                .build();
    }

    /**
     * AI-based speaker diarization: identifies speakers using timestamped segments with pause detection
     */
    private MeetingResponse.DiarizedTranscript identifySpeakers(String boardId, String userId, List<WhisperSegment> segments) {
        String inputText = formatSegmentsForDiarization(segments);
        if (inputText.length() > MAX_DIARIZE_INPUT_CHARS) {
            String sub = inputText.substring(0, MAX_DIARIZE_INPUT_CHARS);
            int lastNewline = sub.lastIndexOf('\n');
            inputText = lastNewline > MAX_DIARIZE_INPUT_CHARS / 2
                    ? sub.substring(0, lastNewline)
                    : sub;
            log.info("Diarization input truncated: {} segments -> {} chars", segments.size(), inputText.length());
        }

        String userPrompt = "Timestamped meeting transcript:\n\n" + inputText;
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

    private List<WhisperSegment> splitAndTranscribe(MultipartFile audioFile,
                                      String boardId, String userId, String userName, String meetingId) {
        // Try FFmpeg first, fallback to byte chunking
        if (isFFmpegAvailable()) {
            try {
                return splitAndTranscribeWithFFmpeg(audioFile, boardId, userId, userName, meetingId);
            } catch (Exception e) {
                log.warn("FFmpeg split failed, falling back to byte chunking: {}", e.getMessage());
            }
        } else {
            log.warn("FFmpeg not available at '{}', using byte chunking fallback", ffmpegPath);
        }
        return splitAndTranscribeByBytes(audioFile, boardId, userId, userName, meetingId);
    }

    private boolean isFFmpegAvailable() {
        try {
            Process process = new ProcessBuilder(ffmpegPath, "-version")
                    .redirectErrorStream(true).start();
            process.getInputStream().readAllBytes();
            boolean completed = process.waitFor(10, TimeUnit.SECONDS);
            if (!completed) {
                process.destroyForcibly();
                return false;
            }
            return process.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    private List<WhisperSegment> splitAndTranscribeWithFFmpeg(MultipartFile audioFile,
                                                String boardId, String userId, String userName, String meetingId) {
        Path tempDir = null;
        try {
            tempDir = Files.createTempDirectory("audio_split_");
            String extension = ".webm";
            String originalName = audioFile.getOriginalFilename();
            if (originalName != null && originalName.contains(".")) {
                extension = originalName.substring(originalName.lastIndexOf("."));
            }
            Path tempInput = tempDir.resolve("input" + extension);
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
            boolean completed = process.waitFor(5, TimeUnit.MINUTES);

            if (!completed) {
                process.destroyForcibly();
                log.error("FFmpeg split timed out after 5 minutes");
                throw new RuntimeException("FFmpeg timed out after 5 minutes");
            }

            int exitCode = process.exitValue();
            if (exitCode != 0) {
                log.error("FFmpeg split failed (exit {}): {}", exitCode, ffmpegOutput);
                throw new RuntimeException("FFmpeg exit code: " + exitCode);
            }

            // 청크 파일 수집 및 순차 전사
            List<Path> chunks = new ArrayList<>();
            for (int i = 0; ; i++) {
                Path chunk = tempDir.resolve(String.format("chunk_%03d%s", i, extension));
                if (!Files.exists(chunk)) break;
                chunks.add(chunk);
            }

            if (chunks.isEmpty()) {
                throw new RuntimeException("FFmpeg produced no chunks");
            }

            log.info("Audio split into {} chunks via FFmpeg", chunks.size());
            return transcribeChunks(chunks, extension, boardId, userId, userName, meetingId);

        } catch (Exception e) {
            throw new RuntimeException("FFmpeg transcription failed: " + e.getMessage(), e);
        } finally {
            cleanupTempFiles(tempDir);
        }
    }

    /**
     * FFmpeg 없이 바이트 단위로 분할하여 전사 (fallback)
     * Whisper API는 불완전한 오디오 컨테이너도 처리 가능
     */
    private List<WhisperSegment> splitAndTranscribeByBytes(MultipartFile audioFile,
                                             String boardId, String userId, String userName, String meetingId) {
        try {
            byte[] allBytes = audioFile.getBytes();
            String extension = ".webm";
            String originalName = audioFile.getOriginalFilename();
            if (originalName != null && originalName.contains(".")) {
                extension = originalName.substring(originalName.lastIndexOf("."));
            }

            int chunkSize = (int) WHISPER_CHUNK_SIZE;
            int totalChunks = (int) Math.ceil((double) allBytes.length / chunkSize);
            log.info("Splitting audio into {} byte chunks ({} bytes total)", totalChunks, allBytes.length);

            List<WhisperSegment> allSegments = new ArrayList<>();
            double timeOffset = 0.0;
            for (int i = 0; i < totalChunks; i++) {
                int offset = i * chunkSize;
                int length = Math.min(chunkSize, allBytes.length - offset);
                byte[] chunkBytes = Arrays.copyOfRange(allBytes, offset, offset + length);

                List<WhisperSegment> chunkSegments = callWhisperAPIWithBytes(chunkBytes, "chunk_" + i + extension);

                // Offset timestamps for absolute positioning
                double finalTimeOffset = timeOffset;
                chunkSegments.stream()
                        .map(s -> new WhisperSegment(s.start() + finalTimeOffset, s.end() + finalTimeOffset, s.text()))
                        .forEach(allSegments::add);

                // Next chunk offset = last segment end of this chunk
                if (!chunkSegments.isEmpty()) {
                    timeOffset += chunkSegments.getLast().end();
                }

                log.info("Byte chunk {}/{} transcribed ({} bytes, {} segments)",
                        i + 1, totalChunks, length, chunkSegments.size());

                int chunkPercent = 5 + (int) ((60.0 * (i + 1)) / totalChunks);
                sendProgress(boardId, userId, userName, meetingId, "TRANSCRIBING", i + 1, totalChunks, chunkPercent);
            }

            return allSegments;

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Byte chunk transcription failed: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.TRANSCRIPTION_FAILED);
        }
    }

    private List<WhisperSegment> transcribeChunks(List<Path> chunks, String extension,
                                    String boardId, String userId, String userName, String meetingId) throws IOException {
        List<WhisperSegment> allSegments = new ArrayList<>();
        for (int i = 0; i < chunks.size(); i++) {
            Path chunk = chunks.get(i);
            byte[] chunkBytes = Files.readAllBytes(chunk);
            List<WhisperSegment> chunkSegments = callWhisperAPIWithBytes(chunkBytes, "chunk_" + i + extension);

            // FFmpeg chunks: offset by chunk index * chunk duration
            double timeOffset = (double) i * CHUNK_DURATION_SECONDS;
            chunkSegments.stream()
                    .map(s -> new WhisperSegment(s.start() + timeOffset, s.end() + timeOffset, s.text()))
                    .forEach(allSegments::add);

            log.info("Chunk {}/{} transcribed ({} segments)", i + 1, chunks.size(), chunkSegments.size());

            int chunkPercent = 5 + (int) ((60.0 * (i + 1)) / chunks.size());
            sendProgress(boardId, userId, userName, meetingId, "TRANSCRIBING", i + 1, chunks.size(), chunkPercent);
        }
        return allSegments;
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

    private List<WhisperSegment> callWhisperAPI(MultipartFile audioFile) {
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

    @SuppressWarnings("unchecked")
    private List<WhisperSegment> callWhisperAPIWithBytes(byte[] audioBytes, String filename) {
        Exception lastException = null;

        for (int attempt = 1; attempt <= WHISPER_MAX_RETRIES; attempt++) {
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
                body.add("response_format", "verbose_json");
                body.add("language", "ko");

                HttpEntity<MultiValueMap<String, Object>> entity = new HttpEntity<>(body, headers);

                RestTemplate whisperRestTemplate = new RestTemplateBuilder()
                        .connectTimeout(Duration.ofSeconds(10))
                        .readTimeout(Duration.ofSeconds(300))
                        .build();

                ResponseEntity<Map> response = whisperRestTemplate.postForEntity(
                        WHISPER_API_URL, entity, Map.class);

                if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                    Map<String, Object> responseBody = response.getBody();

                    // Parse segments from verbose_json response
                    Object segmentsObj = responseBody.get("segments");
                    if (segmentsObj instanceof List<?> segmentsList && !segmentsList.isEmpty()) {
                        List<WhisperSegment> result = new ArrayList<>();
                        for (Object segObj : segmentsList) {
                            if (segObj instanceof Map<?, ?> seg) {
                                double start = toDouble(seg.get("start"));
                                double end = toDouble(seg.get("end"));
                                String text = seg.get("text") != null ? seg.get("text").toString().trim() : "";
                                if (!text.isEmpty()) {
                                    result.add(new WhisperSegment(start, end, text));
                                }
                            }
                        }
                        if (!result.isEmpty()) {
                            return result;
                        }
                    }

                    // Fallback: no segments, use full text as single segment
                    Object text = responseBody.get("text");
                    if (text != null && !text.toString().isBlank()) {
                        return List.of(new WhisperSegment(0.0, 0.0, text.toString().trim()));
                    }
                }

                throw new BusinessException(ErrorCode.TRANSCRIPTION_FAILED);

            } catch (BusinessException e) {
                throw e; // Don't retry business errors
            } catch (Exception e) {
                lastException = e;
                log.warn("Whisper API attempt {}/{} failed: {}", attempt, WHISPER_MAX_RETRIES, e.getMessage());
                if (attempt < WHISPER_MAX_RETRIES) {
                    try {
                        Thread.sleep(WHISPER_RETRY_DELAY_MS * attempt);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new BusinessException(ErrorCode.TRANSCRIPTION_FAILED);
                    }
                }
            }
        }

        log.error("Whisper API failed after {} retries", WHISPER_MAX_RETRIES, lastException);
        throw new BusinessException(ErrorCode.TRANSCRIPTION_FAILED);
    }

    private static double toDouble(Object value) {
        if (value instanceof Number n) return n.doubleValue();
        if (value instanceof String s) {
            try { return Double.parseDouble(s); } catch (NumberFormatException e) { return 0.0; }
        }
        return 0.0;
    }

    /**
     * Format Whisper segments into timestamped text with pause markers for diarization.
     * Example output:
     *   [00:00.0 - 00:05.2] 오늘 회의 시작하겠습니다
     *     ⏸ 0.6s
     *   [00:05.8 - 00:12.1] 네 준비됐습니다
     *     ⏸ 1.4s
     *   [00:13.5 - 00:20.3] 첫 번째 안건은...
     */
    private String formatSegmentsForDiarization(List<WhisperSegment> segments) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < segments.size(); i++) {
            WhisperSegment seg = segments.get(i);
            sb.append(String.format("[%s - %s] %s",
                    formatTimestamp(seg.start()), formatTimestamp(seg.end()), seg.text()));
            sb.append('\n');

            // Add pause marker between segments
            if (i < segments.size() - 1) {
                double pause = segments.get(i + 1).start() - seg.end();
                if (pause > 0.1) {
                    sb.append(String.format("  ⏸ %.1fs\n", pause));
                }
            }
        }
        return sb.toString();
    }

    private static String formatTimestamp(double seconds) {
        int mins = (int) (seconds / 60);
        double secs = seconds % 60;
        return String.format("%02d:%04.1f", mins, secs);
    }

    /**
     * Send transcription progress event to requesting user via WebSocket.
     */
    private void sendProgress(String boardId, String userId, String userName,
                               String meetingId, String stage, int current, int total, int percent) {
        try {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("meeting_id", meetingId);
            data.put("stage", stage);
            data.put("current", current);
            data.put("total", total);
            data.put("percent", percent);
            webSocketEventService.sendBoardEvent(boardId, BoardEventType.TRANSCRIPTION_PROGRESS,
                    userId, userName, data);
        } catch (Exception e) {
            log.debug("Failed to send transcription progress: {}", e.getMessage());
        }
    }
}
