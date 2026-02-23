package com.kanban.domain.diary.service;

import com.kanban.domain.diary.*;
import com.kanban.domain.diary.dto.DiaryResponse;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
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

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class DiaryVoiceService {

    private final DiaryEntryRepository diaryEntryRepository;
    private final DiaryMessageRepository diaryMessageRepository;
    private final DiaryVoiceSettingsRepository voiceSettingsRepository;
    private final UserRepository userRepository;
    private final DiaryAIService diaryAIService;
    private final AiCreditService aiCreditService;
    private final AiUsageLogRepository aiUsageLogRepository;

    @Value("${ai.openai.api-key:}")
    private String openaiApiKey;

    private static final String WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";
    private static final String TTS_API_URL = "https://api.openai.com/v1/audio/speech";
    private static final String WHISPER_MODEL = "whisper-1";
    private static final String TTS_MODEL = "tts-1";
    private static final long MAX_VOICE_SIZE = 25 * 1024 * 1024; // 25MB

    /**
     * 음성 메시지 처리: STT → AI 응답 → TTS
     */
    @Transactional
    public DiaryResponse.VoiceReply processVoiceMessage(
            String userId, String diaryId, MultipartFile audioFile) {

        // Validate
        DiaryEntry entry = diaryEntryRepository.findById(diaryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.DIARY_NOT_FOUND));
        if (!entry.isOwner(userId)) {
            throw new BusinessException(ErrorCode.DIARY_ACCESS_DENIED);
        }
        if (openaiApiKey == null || openaiApiKey.isBlank()) {
            throw new BusinessException(ErrorCode.AI_SERVICE_UNAVAILABLE);
        }
        if (audioFile.isEmpty()) {
            throw new BusinessException(ErrorCode.DIARY_VOICE_FILE_EMPTY);
        }
        if (audioFile.getSize() > MAX_VOICE_SIZE) {
            throw new BusinessException(ErrorCode.DIARY_VOICE_FILE_TOO_LARGE);
        }

        // 1. STT: 음성 → 텍스트
        aiCreditService.consumeUserCredit(userId, "DIARY_VOICE_STT", 1);
        String userText = transcribeAudio(audioFile);
        log.info("Diary voice STT completed: diary={}, text_length={}", diaryId, userText.length());

        // 2. 텍스트 메시지로 저장 + AI 응답 생성
        int nextOrder = diaryMessageRepository.findMaxMessageOrder(diaryId) + 1;

        DiaryMessage userMessage = DiaryMessage.builder()
                .diary(entry)
                .role("USER")
                .content(userText)
                .messageOrder(nextOrder)
                .build();
        diaryMessageRepository.save(userMessage);

        // AI 응답 생성 (기존 DiaryAIService 재사용)
        String aiText = diaryAIService.generateChatReply(entry, userText);

        // 3. TTS: AI 응답 → 음성
        aiCreditService.consumeUserCredit(userId, "DIARY_VOICE_TTS", 1);
        DiaryVoiceSettings settings = voiceSettingsRepository.findByUserId(userId).orElse(null);
        String voiceType = settings != null ? settings.getVoiceType() : "nova";
        BigDecimal speed = settings != null ? settings.getSpeed() : BigDecimal.ONE;

        byte[] aiAudioBytes = generateSpeech(aiText, voiceType, speed);
        log.info("Diary voice TTS completed: diary={}, audio_bytes={}", diaryId, aiAudioBytes.length);

        // AI 메시지 저장 (음성 URL은 클라이언트에서 blob으로 처리)
        DiaryMessage aiMessage = DiaryMessage.builder()
                .diary(entry)
                .role("AI")
                .content(aiText)
                .messageOrder(nextOrder + 1)
                .build();
        diaryMessageRepository.save(aiMessage);

        // 음성 데이터를 Base64로 인코딩하여 반환 (별도 파일 저장 없이)
        String aiAudioBase64 = java.util.Base64.getEncoder().encodeToString(aiAudioBytes);
        String aiAudioDataUrl = "data:audio/mp3;base64," + aiAudioBase64;

        return DiaryResponse.VoiceReply.builder()
                .diaryId(diaryId)
                .userText(userText)
                .userMessage(DiaryResponse.MessageDetail.of(userMessage))
                .aiText(aiText)
                .aiMessage(DiaryResponse.MessageDetail.of(aiMessage))
                .aiAudioUrl(aiAudioDataUrl)
                .build();
    }

    /**
     * OpenAI Whisper API로 음성 변환
     */
    private String transcribeAudio(MultipartFile audioFile) {
        try {
            byte[] audioBytes = audioFile.getBytes();
            String filename = audioFile.getOriginalFilename() != null
                    ? audioFile.getOriginalFilename() : "recording.webm";

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
            body.add("language", "ko");

            HttpEntity<MultiValueMap<String, Object>> entity = new HttpEntity<>(body, headers);

            RestTemplate restTemplate = new RestTemplateBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .readTimeout(Duration.ofSeconds(60))
                    .build();

            @SuppressWarnings("unchecked")
            ResponseEntity<Map> response = restTemplate.postForEntity(
                    WHISPER_API_URL, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object text = response.getBody().get("text");
                if (text != null && !text.toString().isBlank()) {
                    return text.toString();
                }
            }

            throw new BusinessException(ErrorCode.DIARY_VOICE_STT_FAILED);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Whisper STT failed for diary voice: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.DIARY_VOICE_STT_FAILED);
        }
    }

    /**
     * OpenAI TTS API로 텍스트 → 음성 생성
     */
    private byte[] generateSpeech(String text, String voice, BigDecimal speed) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(openaiApiKey);

            Map<String, Object> requestBody = Map.of(
                    "model", TTS_MODEL,
                    "input", text,
                    "voice", voice,
                    "speed", speed,
                    "response_format", "mp3"
            );

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            RestTemplate restTemplate = new RestTemplateBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .readTimeout(Duration.ofSeconds(60))
                    .build();

            ResponseEntity<byte[]> response = restTemplate.exchange(
                    TTS_API_URL, HttpMethod.POST, entity, byte[].class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return response.getBody();
            }

            throw new BusinessException(ErrorCode.DIARY_VOICE_TTS_FAILED);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("TTS generation failed: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.DIARY_VOICE_TTS_FAILED);
        }
    }

    // ============================
    // Voice Settings
    // ============================

    @Transactional(readOnly = true)
    public DiaryVoiceSettings getVoiceSettings(String userId) {
        return voiceSettingsRepository.findByUserId(userId).orElse(null);
    }

    @Transactional
    public DiaryVoiceSettings updateVoiceSettings(String userId, String voiceType,
                                                   Boolean autoPlay, BigDecimal speed) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        DiaryVoiceSettings settings = voiceSettingsRepository.findByUserId(userId)
                .orElseGet(() -> DiaryVoiceSettings.builder()
                        .user(user)
                        .build());

        settings.update(voiceType, autoPlay, speed);
        return voiceSettingsRepository.save(settings);
    }
}
