package com.kanban.domain.customicon.service;

import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Object;

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

    private final boolean s3Enabled;
    private final String localDir;
    private final String bucketName;
    private final String cloudfrontDomain;
    private final S3Client s3Client;

    private static final int ICON_OUTPUT_SIZE = 256;

    public CustomIconImageService(
            @Value("${app.file.s3-enabled:false}") boolean s3Enabled,
            @Value("${app.file.local-dir:./uploads}") String localDir,
            @Value("${app.file.s3-bucket:}") String bucketName,
            @Value("${app.file.cloudfront-domain:}") String cloudfrontDomain,
            @Autowired(required = false) S3Client s3Client
    ) {
        this.s3Enabled = s3Enabled;
        this.localDir = localDir;
        this.bucketName = bucketName;
        this.cloudfrontDomain = cloudfrontDomain;
        this.s3Client = s3Client;
    }

    /**
     * 레퍼런스 이미지 저장
     */
    public String saveReferenceImage(byte[] imageBytes, String extension) {
        try {
            String referenceId = UUID.randomUUID().toString();
            String key = String.format("customicon/ref/%s.%s", referenceId, extension);
            saveFile(imageBytes, key, "image/" + extension);
            log.info("Reference image saved: {}", key);
            return referenceId;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to save reference image: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.CUSTOMICON_IMAGE_PROCESSING_FAILED);
        }
    }

    /**
     * 레퍼런스 이미지 로드 (byte[])
     */
    public byte[] loadReferenceImage(String referenceId) {
        try {
            String prefix = "customicon/ref/" + referenceId + ".";

            if (useS3()) {
                // S3: prefix로 목록 조회
                var response = s3Client.listObjectsV2(ListObjectsV2Request.builder()
                        .bucket(bucketName).prefix(prefix).maxKeys(1).build());
                if (response.contents().isEmpty()) {
                    throw new BusinessException(ErrorCode.CUSTOMICON_REFERENCE_NOT_FOUND);
                }
                String key = response.contents().get(0).key();
                return s3Client.getObject(GetObjectRequest.builder()
                        .bucket(bucketName).key(key).build()).readAllBytes();
            } else {
                // Local
                Path refDir = Paths.get(localDir, "customicon/ref");
                Path found = Files.list(refDir)
                        .filter(p -> p.getFileName().toString().startsWith(referenceId + "."))
                        .findFirst()
                        .orElseThrow(() -> new BusinessException(ErrorCode.CUSTOMICON_REFERENCE_NOT_FOUND));
                return Files.readAllBytes(found);
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
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

            // 스프라이트 시트 저장
            String spriteKey = resultDir + "/sprite.png";
            saveFile(spriteSheetBytes, spriteKey, "image/png");

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

                    // PNG 바이트로 변환
                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    ImageIO.write(normalized, "png", baos);
                    byte[] iconBytes = baos.toByteArray();

                    // 저장
                    String iconFileName = String.format("icon_%02d.png", idx);
                    String iconKey = resultDir + "/" + iconFileName;
                    saveFile(iconBytes, iconKey, "image/png");

                    String iconUrl = buildUrl(iconKey);
                    icons.add(new IconResult(iconNames.get(idx), idx, iconUrl,
                            ICON_OUTPUT_SIZE + "x" + ICON_OUTPUT_SIZE));
                    idx++;
                }
            }

            String spriteUrl = buildUrl(spriteKey);
            return new CropResult(jobId, spriteUrl, icons);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Crop and normalize failed: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.CUSTOMICON_IMAGE_PROCESSING_FAILED);
        }
    }

    public String getReferenceUrl(String referenceId) {
        try {
            String prefix = "customicon/ref/" + referenceId + ".";

            if (useS3()) {
                var response = s3Client.listObjectsV2(ListObjectsV2Request.builder()
                        .bucket(bucketName).prefix(prefix).maxKeys(1).build());
                if (response.contents().isEmpty()) return null;
                return buildUrl(response.contents().get(0).key());
            } else {
                Path refDir = Paths.get(localDir, "customicon/ref");
                Path found = Files.list(refDir)
                        .filter(p -> p.getFileName().toString().startsWith(referenceId + "."))
                        .findFirst()
                        .orElse(null);
                if (found == null) return null;
                return "/uploads/customicon/ref/" + found.getFileName().toString();
            }
        } catch (Exception e) {
            return null;
        }
    }

    // ─── 스토리지 추상화 ───

    private boolean useS3() {
        return s3Enabled && s3Client != null;
    }

    private void saveFile(byte[] data, String key, String contentType) {
        try {
            if (useS3()) {
                s3Client.putObject(
                        PutObjectRequest.builder()
                                .bucket(bucketName)
                                .key(key)
                                .contentType(contentType)
                                .contentLength((long) data.length)
                                .build(),
                        RequestBody.fromBytes(data)
                );
            } else {
                Path filePath = Paths.get(localDir, key);
                Files.createDirectories(filePath.getParent());
                Files.write(filePath, data);
            }
        } catch (IOException e) {
            log.error("Failed to save file: {}", key, e);
            throw new BusinessException(ErrorCode.CUSTOMICON_IMAGE_PROCESSING_FAILED);
        }
    }

    private String buildUrl(String key) {
        if (useS3()) {
            if (cloudfrontDomain != null && !cloudfrontDomain.isEmpty()) {
                return String.format("https://%s/%s", cloudfrontDomain, key);
            }
            // CloudFront 미설정 시 백엔드 프록시로 서빙
            return "/api/v1/customicon/files/" + key;
        }
        return "/uploads/" + key;
    }

    /**
     * S3에서 파일 로드 (프록시 서빙용)
     */
    public byte[] loadFile(String key) {
        if (!key.startsWith("customicon/")) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        try {
            if (useS3()) {
                return s3Client.getObject(GetObjectRequest.builder()
                        .bucket(bucketName).key(key).build()).readAllBytes();
            } else {
                Path filePath = Paths.get(localDir, key);
                return Files.readAllBytes(filePath);
            }
        } catch (Exception e) {
            log.error("Failed to load file: {}", key, e);
            throw new BusinessException(ErrorCode.CUSTOMICON_REFERENCE_NOT_FOUND);
        }
    }

    // ─── 이미지 처리 ───

    /**
     * 아이콘 정규화: 콘텐츠 바운딩 박스 → 70% 리사이즈 → 중앙 배치
     */
    private BufferedImage normalizeIcon(BufferedImage cell, int outputSize) {
        int[] bbox = findContentBounds(cell);
        int bx = bbox[0], by = bbox[1], bw = bbox[2], bh = bbox[3];

        if (bw <= 0 || bh <= 0) {
            return resizeImage(cell, outputSize, outputSize);
        }

        BufferedImage content = cell.getSubimage(bx, by, bw, bh);

        double targetRatio = 0.70;
        int targetMaxDim = (int) (outputSize * targetRatio);

        double scale = Math.min((double) targetMaxDim / bw, (double) targetMaxDim / bh);
        int newW = Math.max(1, (int) (bw * scale));
        int newH = Math.max(1, (int) (bh * scale));

        BufferedImage resized = resizeImage(content, newW, newH);

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

    private int[] findContentBounds(BufferedImage img) {
        int w = img.getWidth();
        int h = img.getHeight();
        int minX = w, minY = h, maxX = 0, maxY = 0;

        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int argb = img.getRGB(x, y);
                int alpha = (argb >> 24) & 0xFF;
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
            return new int[]{4, 4};
        }
    }

    // 내부 결과 클래스
    public record CropResult(String jobId, String spriteSheetUrl, List<IconResult> icons) {}
    public record IconResult(String name, int index, String url, String size) {}
}
