package com.kanban.domain.customicon.service;

import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
public class CustomIconImageService {

    @Value("${app.file.local-dir:./uploads}")
    private String localDir;

    private static final int ICON_OUTPUT_SIZE = 256;

    /**
     * 레퍼런스 이미지를 로컬에 저장
     */
    public String saveReferenceImage(byte[] imageBytes, String extension) {
        try {
            String referenceId = UUID.randomUUID().toString();
            String key = String.format("customicon/ref/%s.%s", referenceId, extension);
            Path filePath = Paths.get(localDir, key);
            Files.createDirectories(filePath.getParent());
            Files.write(filePath, imageBytes);
            log.info("Reference image saved: {}", filePath);
            return referenceId;
        } catch (IOException e) {
            log.error("Failed to save reference image: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.CUSTOMICON_IMAGE_PROCESSING_FAILED);
        }
    }

    /**
     * 레퍼런스 이미지 로드 (byte[])
     */
    public byte[] loadReferenceImage(String referenceId) {
        try {
            Path refDir = Paths.get(localDir, "customicon/ref");
            // 확장자 모름 → 패턴 매칭
            Path found = Files.list(refDir)
                    .filter(p -> p.getFileName().toString().startsWith(referenceId + "."))
                    .findFirst()
                    .orElseThrow(() -> new BusinessException(ErrorCode.CUSTOMICON_REFERENCE_NOT_FOUND));
            return Files.readAllBytes(found);
        } catch (BusinessException e) {
            throw e;
        } catch (IOException e) {
            log.error("Failed to load reference image: {}", e.getMessage());
            throw new BusinessException(ErrorCode.CUSTOMICON_REFERENCE_NOT_FOUND);
        }
    }

    /**
     * 스프라이트 시트를 저장하고 개별 아이콘으로 크롭 + 정규화
     */
    public CropResult cropAndNormalize(byte[] spriteSheetBytes, List<String> iconNames, String layout) {
        try {
            String jobId = UUID.randomUUID().toString();
            String resultDir = String.format("customicon/result/%s", jobId);
            Path resultPath = Paths.get(localDir, resultDir);
            Files.createDirectories(resultPath);

            // 스프라이트 시트 저장
            Path spritePath = resultPath.resolve("sprite.png");
            Files.write(spritePath, spriteSheetBytes);

            BufferedImage spriteSheet = ImageIO.read(new ByteArrayInputStream(spriteSheetBytes));
            if (spriteSheet == null) {
                throw new BusinessException(ErrorCode.CUSTOMICON_IMAGE_PROCESSING_FAILED);
            }

            // 레이아웃 파싱 (예: "4x4" → 4행 4열)
            int[] grid = parseLayout(layout);
            int cols = grid[0];
            int rows = grid[1];

            int cellW = spriteSheet.getWidth() / cols;
            int cellH = spriteSheet.getHeight() / rows;

            List<IconResult> icons = new ArrayList<>();
            int idx = 0;

            for (int r = 0; r < rows && idx < iconNames.size(); r++) {
                for (int c = 0; c < cols && idx < iconNames.size(); c++) {
                    // 1차: 그리드 셀 크롭
                    int left = c * cellW;
                    int top = r * cellH;
                    BufferedImage cell = spriteSheet.getSubimage(left, top, cellW, cellH);

                    // 2차: 정규화 (바운딩 박스 → 리사이즈 → 중앙정렬)
                    BufferedImage normalized = normalizeIcon(cell, ICON_OUTPUT_SIZE);

                    // 저장
                    String iconFileName = String.format("icon_%02d.png", idx);
                    Path iconPath = resultPath.resolve(iconFileName);
                    ImageIO.write(normalized, "png", iconPath.toFile());

                    String iconUrl = String.format("/uploads/%s/%s", resultDir, iconFileName);
                    icons.add(new IconResult(iconNames.get(idx), idx, iconUrl,
                            ICON_OUTPUT_SIZE + "x" + ICON_OUTPUT_SIZE));
                    idx++;
                }
            }

            String spriteUrl = String.format("/uploads/%s/sprite.png", resultDir);
            return new CropResult(jobId, spriteUrl, icons);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Crop and normalize failed: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.CUSTOMICON_IMAGE_PROCESSING_FAILED);
        }
    }

    /**
     * 아이콘 정규화: 콘텐츠 바운딩 박스 → 70% 리사이즈 → 중앙 배치
     */
    private BufferedImage normalizeIcon(BufferedImage cell, int outputSize) {
        // 콘텐츠 바운딩 박스 계산
        int[] bbox = findContentBounds(cell);
        int bx = bbox[0], by = bbox[1], bw = bbox[2], bh = bbox[3];

        if (bw <= 0 || bh <= 0) {
            // 빈 아이콘 → 그대로 리사이즈
            return resizeImage(cell, outputSize, outputSize);
        }

        // 콘텐츠 추출
        BufferedImage content = cell.getSubimage(bx, by, bw, bh);

        // 목표 크기: 출력 캔버스의 70%
        double targetRatio = 0.70;
        int targetMaxDim = (int) (outputSize * targetRatio);

        // 종횡비 유지 리사이즈
        double scale = Math.min((double) targetMaxDim / bw, (double) targetMaxDim / bh);
        int newW = Math.max(1, (int) (bw * scale));
        int newH = Math.max(1, (int) (bh * scale));

        BufferedImage resized = resizeImage(content, newW, newH);

        // 투명 캔버스에 중앙 배치
        BufferedImage output = new BufferedImage(outputSize, outputSize, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = output.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        int x = (outputSize - newW) / 2;
        int y = (outputSize - newH) / 2;
        g.drawImage(resized, x, y, null);
        g.dispose();

        return output;
    }

    /**
     * 비투명 픽셀의 바운딩 박스 계산
     */
    private int[] findContentBounds(BufferedImage img) {
        int w = img.getWidth();
        int h = img.getHeight();
        int minX = w, minY = h, maxX = 0, maxY = 0;

        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int argb = img.getRGB(x, y);
                int alpha = (argb >> 24) & 0xFF;
                // 흰색도 배경으로 취급 (alpha 낮거나 거의 흰색)
                if (alpha > 20 && !isNearWhite(argb)) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }

        if (maxX < minX || maxY < minY) {
            return new int[]{0, 0, 0, 0};
        }
        return new int[]{minX, minY, maxX - minX + 1, maxY - minY + 1};
    }

    private boolean isNearWhite(int argb) {
        int r = (argb >> 16) & 0xFF;
        int g = (argb >> 8) & 0xFF;
        int b = argb & 0xFF;
        return r > 240 && g > 240 && b > 240;
    }

    private BufferedImage resizeImage(BufferedImage src, int newW, int newH) {
        BufferedImage resized = new BufferedImage(newW, newH, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = resized.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.drawImage(src, 0, 0, newW, newH, null);
        g.dispose();
        return resized;
    }

    private int[] parseLayout(String layout) {
        try {
            String[] parts = layout.toLowerCase().split("x");
            return new int[]{Integer.parseInt(parts[0]), Integer.parseInt(parts[1])};
        } catch (Exception e) {
            return new int[]{4, 4}; // 기본값
        }
    }

    public String getReferenceUrl(String referenceId) {
        try {
            Path refDir = Paths.get(localDir, "customicon/ref");
            Path found = Files.list(refDir)
                    .filter(p -> p.getFileName().toString().startsWith(referenceId + "."))
                    .findFirst()
                    .orElse(null);
            if (found == null) return null;
            return "/uploads/customicon/ref/" + found.getFileName().toString();
        } catch (IOException e) {
            return null;
        }
    }

    // 내부 결과 클래스
    public record CropResult(String jobId, String spriteSheetUrl, List<IconResult> icons) {}
    public record IconResult(String name, int index, String url, String size) {}
}
