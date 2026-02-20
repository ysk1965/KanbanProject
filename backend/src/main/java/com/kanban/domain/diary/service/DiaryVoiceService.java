package com.kanban.domain.diary.service;

import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class DiaryVoiceService {

    @Value("${ai.openai.api-key:}")
    private String openaiApiKey;

    private static final String WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";
    private static final String WHISPER_MODEL = "whisper-1";
    private static final long MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB (diary는 짧은 녹음)

    public String transcribe(MultipartFile audioFile) {
        if (openaiApiKey == null || openaiApiKey.isBlank()) {
            throw new BusinessException(ErrorCode.AI_SERVICE_UNAVAILABLE);
        }

        if (audioFile.isEmpty()) {
            throw new BusinessException(ErrorCode.TRANSCRIPTION_FILE_EMPTY);
        }

        if (audioFile.getSize() > MAX_AUDIO_SIZE) {
            throw new BusinessException(ErrorCode.TRANSCRIPTION_FILE_TOO_LARGE);
        }

        try {
            byte[] audioBytes = audioFile.getBytes();
            String filename = audioFile.getOriginalFilename() != null
                    ? audioFile.getOriginalFilename()
                    : "recording.webm";

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

            RestTemplate whisperRestTemplate = new RestTemplateBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .readTimeout(Duration.ofSeconds(60))
                    .build();

            @SuppressWarnings("unchecked")
            ResponseEntity<Map> response = whisperRestTemplate.postForEntity(
                    WHISPER_API_URL, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object text = response.getBody().get("text");
                if (text != null) {
                    log.info("Diary voice transcription completed ({} chars)", text.toString().length());
                    return text.toString();
                }
            }

            throw new BusinessException(ErrorCode.TRANSCRIPTION_FAILED);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Diary voice transcription failed: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.TRANSCRIPTION_FAILED);
        }
    }
}
