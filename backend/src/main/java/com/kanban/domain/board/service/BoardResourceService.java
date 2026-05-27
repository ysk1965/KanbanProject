package com.kanban.domain.board.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardResource;
import com.kanban.domain.board.BoardResourceRepository;
import com.kanban.domain.board.dto.BoardResourceRequest;
import com.kanban.domain.board.dto.BoardResourceResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardResourceService {

    private final BoardResourceRepository boardResourceRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;

    private static final int MAX_RESOURCES_PER_BOARD = 20;
    private static final int FAVICON_CONNECT_TIMEOUT_MS = 3000;
    private static final int FAVICON_READ_TIMEOUT_MS = 3000;
    private static final int FAVICON_MAX_READ_BYTES = 32768;
    private static final String USER_AGENT = "Mozilla/5.0 (compatible; BridgeBot/1.0)";

    private static final Pattern LINK_TAG_PATTERN = Pattern.compile(
            "<link\\b([^>]*)>", Pattern.CASE_INSENSITIVE);
    private static final Pattern REL_PATTERN = Pattern.compile(
            "rel=[\"']([^\"']*)[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern HREF_PATTERN = Pattern.compile(
            "href=[\"']([^\"']*)[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern SIZES_PATTERN = Pattern.compile(
            "sizes=[\"']([^\"']*)[\"']", Pattern.CASE_INSENSITIVE);

    public BoardResourceResponse.ListResponse getResources(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        List<BoardResource> resources = boardResourceRepository.findByBoardIdOrderByDisplayOrderAsc(boardId);
        return BoardResourceResponse.ListResponse.of(resources);
    }

    @Transactional
    public BoardResourceResponse.Detail createResource(String boardId, String userId,
                                                        BoardResourceRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);

        long currentCount = boardResourceRepository.countByBoardId(boardId);
        if (currentCount >= MAX_RESOURCES_PER_BOARD) {
            throw new BusinessException(ErrorCode.BOARD_RESOURCE_LIMIT_EXCEEDED);
        }

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        BoardResource resource = BoardResource.builder()
                .board(board)
                .title(request.getTitle().trim())
                .url(request.getUrl().trim())
                .description(request.getDescription() != null ? request.getDescription().trim() : null)
                .faviconUrl(deriveFaviconUrl(request.getUrl()))
                .displayOrder((int) currentCount)
                .createdBy(user)
                .build();

        boardResourceRepository.save(resource);
        log.info("Board resource created: {} for board: {} by user: {}", resource.getId(), boardId, userId);

        return BoardResourceResponse.Detail.of(resource);
    }

    @Transactional
    public BoardResourceResponse.Detail updateResource(String boardId, String resourceId, String userId,
                                                        BoardResourceRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        BoardResource resource = boardResourceRepository.findById(resourceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_RESOURCE_NOT_FOUND));

        if (!resource.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.BOARD_RESOURCE_NOT_FOUND);
        }

        resource.update(request.getTitle().trim(), request.getUrl().trim(),
                request.getDescription() != null ? request.getDescription().trim() : null);
        resource.updateFaviconUrl(deriveFaviconUrl(request.getUrl()));

        log.info("Board resource updated: {} for board: {} by user: {}", resourceId, boardId, userId);
        return BoardResourceResponse.Detail.of(resource);
    }

    @Transactional
    public void deleteResource(String boardId, String resourceId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        BoardResource resource = boardResourceRepository.findById(resourceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_RESOURCE_NOT_FOUND));

        if (!resource.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.BOARD_RESOURCE_NOT_FOUND);
        }

        boardResourceRepository.delete(resource);
        log.info("Board resource deleted: {} from board: {} by user: {}", resourceId, boardId, userId);
    }

    @Transactional
    public BoardResourceResponse.ListResponse reorderResources(String boardId, String userId,
                                                                 BoardResourceRequest.Reorder request) {
        boardService.checkMemberOrAbove(boardId, userId);

        List<BoardResource> resources = boardResourceRepository.findByBoardIdOrderByDisplayOrderAsc(boardId);

        for (int i = 0; i < request.getResourceIds().size(); i++) {
            final int order = i;
            final String id = request.getResourceIds().get(i);
            resources.stream()
                    .filter(r -> r.getId().equals(id))
                    .findFirst()
                    .ifPresent(r -> r.updateDisplayOrder(order));
        }

        return BoardResourceResponse.ListResponse.of(
                boardResourceRepository.findByBoardIdOrderByDisplayOrderAsc(boardId));
    }

    @Transactional
    public BoardResourceResponse.ListResponse refreshFavicons(String boardId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        List<BoardResource> resources = boardResourceRepository.findByBoardIdOrderByDisplayOrderAsc(boardId);
        for (BoardResource resource : resources) {
            String newFavicon = deriveFaviconUrl(resource.getUrl());
            resource.updateFaviconUrl(newFavicon);
        }

        log.info("Refreshed favicons for {} resources in board: {}", resources.size(), boardId);
        return BoardResourceResponse.ListResponse.of(resources);
    }

    private String deriveFaviconUrl(String url) {
        try {
            URI uri = new URI(url);
            String host = uri.getHost();
            if (host == null) return null;

            String scheme = uri.getScheme() != null ? uri.getScheme() : "https";
            int port = uri.getPort();
            String origin = scheme + "://" + host + (port > 0 ? ":" + port : "");

            // Step 1: fetch HTML and parse <link rel="icon"> tags
            String fromHtml = extractFaviconFromHtml(url, origin);
            if (fromHtml != null) return fromHtml;

            // Step 2: try /favicon.ico
            String faviconIco = origin + "/favicon.ico";
            if (isUrlAccessible(faviconIco)) return faviconIco;

            // Step 3: fallback to Google Favicon API
            return "https://www.google.com/s2/favicons?domain=" + host + "&sz=64";
        } catch (Exception e) {
            log.debug("Failed to derive favicon URL from: {}", url);
        }
        return null;
    }

    private String extractFaviconFromHtml(String targetUrl, String origin) {
        HttpURLConnection conn = null;
        try {
            conn = openConnection(targetUrl);
            int status = conn.getResponseCode();
            if (status < 200 || status >= 400) return null;

            StringBuilder html = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                char[] buf = new char[4096];
                int totalRead = 0;
                int n;
                while (totalRead < FAVICON_MAX_READ_BYTES && (n = reader.read(buf)) != -1) {
                    html.append(buf, 0, n);
                    totalRead += n;
                }
            }

            return parseFaviconFromHtml(html.toString(), origin);
        } catch (Exception e) {
            log.debug("Failed to extract favicon from HTML: {}", targetUrl);
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private String parseFaviconFromHtml(String html, String origin) {
        record FaviconCandidate(String href, int priority, int size) {}
        List<FaviconCandidate> candidates = new ArrayList<>();

        Matcher linkMatcher = LINK_TAG_PATTERN.matcher(html);
        while (linkMatcher.find()) {
            String attrs = linkMatcher.group(1);

            Matcher relMatcher = REL_PATTERN.matcher(attrs);
            if (!relMatcher.find()) continue;
            String rel = relMatcher.group(1).toLowerCase().trim();

            if (!rel.contains("icon")) continue;

            Matcher hrefMatcher = HREF_PATTERN.matcher(attrs);
            if (!hrefMatcher.find()) continue;
            String href = hrefMatcher.group(1).trim();
            if (href.isEmpty()) continue;

            int priority;
            if (rel.contains("apple-touch-icon")) {
                priority = 0; // highest
            } else if (rel.equals("icon")) {
                priority = 1;
            } else {
                priority = 2; // shortcut icon, etc.
            }

            int size = 0;
            Matcher sizesMatcher = SIZES_PATTERN.matcher(attrs);
            if (sizesMatcher.find()) {
                String sizeStr = sizesMatcher.group(1);
                try {
                    size = Integer.parseInt(sizeStr.split("x")[0]);
                } catch (NumberFormatException ignored) {}
            }

            candidates.add(new FaviconCandidate(href, priority, size));
        }

        if (candidates.isEmpty()) return null;

        // pick best: apple-touch-icon first, then largest icon
        candidates.sort((a, b) -> {
            if (a.priority != b.priority) return Integer.compare(a.priority, b.priority);
            return Integer.compare(b.size, a.size);
        });

        return resolveUrl(candidates.get(0).href, origin);
    }

    private String resolveUrl(String href, String origin) {
        if (href.startsWith("http://") || href.startsWith("https://")) {
            return href;
        } else if (href.startsWith("//")) {
            return "https:" + href;
        } else if (href.startsWith("/")) {
            return origin + href;
        } else {
            return origin + "/" + href;
        }
    }

    private boolean isUrlAccessible(String urlStr) {
        HttpURLConnection conn = null;
        try {
            conn = openConnection(urlStr);
            conn.setRequestMethod("HEAD");
            int status = conn.getResponseCode();
            String contentType = conn.getContentType();
            return status >= 200 && status < 400
                    && contentType != null && contentType.startsWith("image");
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private HttpURLConnection openConnection(String urlStr) throws Exception {
        URL url = new URI(urlStr).toURL();
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(FAVICON_CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(FAVICON_READ_TIMEOUT_MS);
        conn.setRequestProperty("User-Agent", USER_AGENT);
        conn.setInstanceFollowRedirects(true);
        return conn;
    }
}
