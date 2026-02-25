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
            log.error("레퍼런스 이미지 업로드 실패: {}", e.getMessage(), e);
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
        // 1. 스타일 옵션 (프론트엔드에서 전달받은 값 사용)
        CustomIconRequest.StyleOptions opts = request.getStyleOptions();
        if (opts == null) {
            opts = new CustomIconRequest.StyleOptions();
        }

        // 2. 레퍼런스 이미지 로드
        byte[] referenceImage = null;
        if (request.getReferenceId() != null && !request.getReferenceId().isBlank()) {
            try {
                referenceImage = customIconImageService.loadReferenceImage(request.getReferenceId());
                log.info("레퍼런스 이미지 로드 완료, 크기: {} bytes", referenceImage.length);
            } catch (Exception e) {
                log.warn("레퍼런스 이미지 로드 실패, 텍스트 프롬프트만으로 생성합니다: {}", e.getMessage());
            }
        }

        // 3. 프롬프트 구성
        String prompt = buildPrompt(request.getIconNames(), opts, request.getLayout(), referenceImage != null, request.getCustomPrompt());

        // 4. OpenAI API로 스프라이트 시트 생성
        log.info("스프라이트 시트 생성 요청 - 아이콘 {}개, 레이아웃: {}, 레퍼런스: {}",
                request.getIconNames().size(), request.getLayout(), referenceImage != null ? "있음" : "없음");

        byte[] spriteSheetBytes;
        if (referenceImage != null) {
            spriteSheetBytes = openAIImageService.generateSpriteSheet(prompt, referenceImage);
        } else {
            spriteSheetBytes = openAIImageService.generateSpriteSheet(prompt);
        }

        // 5. 개별 아이콘 크롭 + 정규화 (바운딩 박스 → 풀사이즈 → 정중앙)
        CustomIconImageService.CropResult cropResult =
                customIconImageService.cropAndNormalize(spriteSheetBytes, request.getIconNames(), request.getLayout());

        // 6. 응답 DTO 변환
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

    private String buildPrompt(List<String> iconNames, CustomIconRequest.StyleOptions opts, String layout, boolean hasReference, String customPrompt) {
        int[] grid = parseLayout(layout);
        int cols = grid[0];
        int rows = grid[1];
        int totalCells = cols * rows;

        // 아이콘 목록을 Row/Column으로 명시
        StringBuilder iconList = new StringBuilder();
        for (int i = 0; i < iconNames.size(); i++) {
            int row = i / cols + 1;
            int col = i % cols + 1;
            iconList.append(String.format("- Row %d, Col %d: \"%s\"\n", row, col, iconNames.get(i)));
        }

        String referenceInstruction = hasReference ? """

                CRITICAL — REFERENCE IMAGE MATCHING:
                - You MUST match the exact visual style of the provided reference image
                - Copy the line weight, stroke thickness, corner radius, fill style, and overall aesthetic precisely
                - The generated icons should look like they belong to the same icon set as the reference
                - Prioritize visual consistency with the reference over the style parameters below
                """ : "";

        // 사용자 커스텀 프롬프트
        String userInstruction = "";
        if (customPrompt != null && !customPrompt.isBlank()) {
            userInstruction = String.format("""

                    ADDITIONAL USER INSTRUCTIONS:
                    %s
                    """, customPrompt.trim());
        }

        // 스타일 상세 설명 매핑
        String styleDetail = switch (opts.getType()) {
            case "solid" -> "filled/solid icons with no visible stroke, shapes are completely filled";
            case "duotone" -> "duotone icons with a primary filled layer and a lighter secondary fill layer for depth";
            default -> "outline/line icons drawn with consistent stroke width, no fills";
        };

        String strokeDetail = switch (opts.getStrokeWeight()) {
            case "thin" -> "thin (~1px equivalent)";
            case "light" -> "light (~1.5px equivalent)";
            case "bold" -> "bold (~3px equivalent)";
            default -> "medium (~2px equivalent)";
        };

        String cornerDetail = switch (opts.getCornerRadius()) {
            case "sharp" -> "sharp 90-degree corners, no rounding";
            case "slightly-rounded" -> "slightly rounded corners (~2px radius)";
            case "fully-rounded" -> "fully rounded/circular corners";
            default -> "moderately rounded corners (~4px radius)";
        };

        return String.format("""
                Create a sprite sheet image containing exactly %d monochrome UI icons arranged in a strict %dx%d grid on a %s background.
                %s
                ICON LIST (row, column → concept):
                %s
                STYLE SPECIFICATION:
                - %s
                - Stroke weight: %s
                - Corner style: %s
                - Color: single-color black (#000000) or very dark gray (#333333) only
                - Aesthetic: flat 2D, minimalist, professional UI icon style
                - Consistency: every icon must share identical stroke weight, visual size, and level of detail
                - Each icon should be universally recognizable — use the most common visual metaphor for each concept

                GRID LAYOUT (STRICT):
                - The output image is divided into exactly %d equal-sized cells: %d columns x %d rows
                - Each cell occupies exactly 1/%d of the image width and 1/%d of the image height
                - Each icon is perfectly centered within its cell with equal padding on all sides
                - Icons should occupy approximately 70-80%% of their cell area
                - All %d icons must be present — do not skip or merge any cells

                ABSOLUTE PROHIBITIONS:
                - NO grid lines, borders, dividers, rules, or separators of any kind
                - NO connectors, joints, brackets, or linking shapes between icons
                - NO frames, boxes, or containers around individual icons
                - NO text, labels, numbers, letters, or captions anywhere in the image
                - NO 3D effects, shadows, gradients, glows, or drop shadows
                - NO decorative elements, ornaments, or fills between icon cells
                - NO background patterns or textures — cells contain only the icon and empty space
                %s""",
                iconNames.size(), cols, rows,
                opts.getBackground(),
                referenceInstruction,
                iconList,
                styleDetail, strokeDetail, cornerDetail,
                totalCells, cols, rows, cols, rows,
                iconNames.size(),
                userInstruction
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
