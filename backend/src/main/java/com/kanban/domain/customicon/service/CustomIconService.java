package com.kanban.domain.customicon.service;

import com.kanban.domain.customicon.dto.CustomIconRequest;
import com.kanban.domain.customicon.dto.CustomIconResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.Base64;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class CustomIconService {

    private final OpenAIImageService openAIImageService;
    private final CustomIconImageService customIconImageService;

    /**
     * 레퍼런스 이미지 업로드
     */
    public CustomIconResponse.UploadResult uploadReference(MultipartFile file) {
        validateImageFile(file);

        try {
            byte[] imageBytes = file.getBytes();
            String extension = extractExtension(file.getOriginalFilename());
            String referenceId = customIconImageService.saveReferenceImage(imageBytes, extension);
            String url = customIconImageService.getReferenceUrl(referenceId);

            return CustomIconResponse.UploadResult.builder()
                    .referenceId(referenceId)
                    .url(url)
                    .build();

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Reference image upload failed: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.CUSTOMICON_IMAGE_PROCESSING_FAILED);
        }
    }

    /**
     * 레퍼런스 이미지 스타일 분석
     */
    public CustomIconResponse.StyleAnalysis analyzeStyle(CustomIconRequest.AnalyzeStyle request) {
        byte[] imageBytes = customIconImageService.loadReferenceImage(request.getReferenceId());
        String base64Image = Base64.getEncoder().encodeToString(imageBytes);
        return openAIImageService.analyzeStyle(base64Image);
    }

    /**
     * 아이콘 생성 (프롬프트 → 스프라이트 시트 → 크롭/정규화)
     */
    public CustomIconResponse.GenerateResult generate(CustomIconRequest.Generate request) {
        // 1. 스타일 옵션 (프론트에서 전달받은 값 사용)
        CustomIconRequest.StyleOptions opts = request.getStyleOptions();
        if (opts == null) {
            opts = new CustomIconRequest.StyleOptions();
        }

        // 2. 프롬프트 생성
        String prompt = buildPrompt(request.getIconNames(), opts, request.getLayout());

        // 3. OpenAI Images API로 스프라이트 시트 생성
        log.info("Generating sprite sheet with {} icons, layout: {}", request.getIconNames().size(), request.getLayout());
        byte[] spriteSheetBytes = openAIImageService.generateSpriteSheet(prompt);

        // 4. 크롭 + 정규화
        CustomIconImageService.CropResult cropResult =
                customIconImageService.cropAndNormalize(spriteSheetBytes, request.getIconNames(), request.getLayout());

        // 5. 결과 변환
        List<CustomIconResponse.IconInfo> icons = cropResult.icons().stream()
                .map(icon -> CustomIconResponse.IconInfo.builder()
                        .name(icon.name())
                        .index(icon.index())
                        .url(icon.url())
                        .size(icon.size())
                        .build())
                .toList();

        return CustomIconResponse.GenerateResult.builder()
                .jobId(cropResult.jobId())
                .spriteSheetUrl(cropResult.spriteSheetUrl())
                .icons(icons)
                .build();
    }

    private String buildPrompt(List<String> iconNames, CustomIconRequest.StyleOptions opts, String layout) {
        String iconList = String.join(", ", iconNames);
        int[] grid = parseLayout(layout);
        int cols = grid[0];
        int rows = grid[1];

        return String.format("""
                Create a sprite sheet of %d icons arranged in a %dx%d grid on a %s background.
                Each icon should represent: %s

                Style specification:
                - Type: %s
                - Stroke weight: %s
                - Corner radius: %s
                - Padding ratio: %.0f%%

                Important rules:
                - All icons must have consistent style, stroke weight, and visual language
                - Each grid cell contains exactly one icon, centered with equal padding
                - Icons should be clearly separated within the grid
                - No text labels, only visual icons
                - Clean, professional icon design
                """,
                iconNames.size(), cols, rows,
                opts.getBackground(),
                iconList,
                opts.getType(),
                opts.getStrokeWeight(),
                opts.getCornerRadius(),
                opts.getPaddingRatio() * 100
        );
    }

    private void validateImageFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new BusinessException(ErrorCode.FILE_TYPE_NOT_ALLOWED);
        }
    }

    private String extractExtension(String filename) {
        if (filename == null || !filename.contains(".")) {
            return "png";
        }
        return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
    }

    private int[] parseLayout(String layout) {
        try {
            String[] parts = layout.toLowerCase().split("x");
            return new int[]{Integer.parseInt(parts[0]), Integer.parseInt(parts[1])};
        } catch (Exception e) {
            return new int[]{4, 4};
        }
    }
}
