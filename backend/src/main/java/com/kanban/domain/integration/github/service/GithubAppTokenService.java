package com.kanban.domain.integration.github.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.integration.github.config.GithubAppProperties;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import io.jsonwebtoken.Jwts;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * GitHub App 토큰 발급.
 *
 * <p>App 자체를 증명하는 JWT(최대 10분)로 installation access token(1시간)을 받아온다.
 * <b>리프레시 토큰이 없다</b> — 만료되면 그냥 다시 발급받으면 되므로 저장할 것도, 갱신 스케줄러도 필요 없다.
 * 이것이 PAT/OAuth 대신 App을 고른 이유다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GithubAppTokenService {

    private static final String PKCS1_HEADER = "-----BEGIN RSA PRIVATE KEY-----";
    private static final String PKCS8_HEADER = "-----BEGIN PRIVATE KEY-----";
    /** 만료 직전 재사용을 피하기 위한 여유 */
    private static final Duration EXPIRY_MARGIN = Duration.ofMinutes(5);

    private final GithubAppProperties properties;
    private final RestTemplate restTemplate;

    private final Map<String, CachedToken> tokenCache = new ConcurrentHashMap<>();
    private volatile PrivateKey cachedPrivateKey;

    private record CachedToken(String token, Instant expiresAt) {
        boolean isUsable() {
            return Instant.now().isBefore(expiresAt.minus(EXPIRY_MARGIN));
        }
    }

    /**
     * 설치 액세스 토큰. 만료 5분 전까지는 캐시를 재사용한다.
     */
    public String getInstallationToken(String installationId) {
        CachedToken cached = tokenCache.get(installationId);
        if (cached != null && cached.isUsable()) {
            return cached.token();
        }
        synchronized (this) {
            CachedToken again = tokenCache.get(installationId);
            if (again != null && again.isUsable()) {
                return again.token();
            }
            CachedToken issued = issueInstallationToken(installationId);
            tokenCache.put(installationId, issued);
            return issued.token();
        }
    }

    public void evict(String installationId) {
        tokenCache.remove(installationId);
    }

    private CachedToken issueInstallationToken(String installationId) {
        requireConfigured();
        String url = properties.getApiBaseUrl() + "/app/installations/" + installationId + "/access_tokens";

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(createAppJwt());
        headers.setAccept(java.util.List.of(MediaType.valueOf("application/vnd.github+json")));
        headers.set("X-GitHub-Api-Version", "2022-11-28");

        try {
            ResponseEntity<JsonNode> response = restTemplate.exchange(
                    url, HttpMethod.POST, new HttpEntity<>(headers), JsonNode.class);
            JsonNode body = response.getBody();
            if (body == null || body.path("token").asText(null) == null) {
                throw new BusinessException(ErrorCode.GITHUB_API_ERROR, "설치 토큰 응답이 비어 있습니다");
            }
            String token = body.path("token").asText();
            Instant expiresAt = body.hasNonNull("expires_at")
                    ? Instant.parse(body.path("expires_at").asText())
                    : Instant.now().plus(Duration.ofHours(1));
            return new CachedToken(token, expiresAt);
        } catch (HttpStatusCodeException e) {
            int status = e.getStatusCode().value();
            log.warn("GitHub 설치 토큰 발급 실패 installationId={} status={} body={}",
                    installationId, status, e.getResponseBodyAsString());
            if (status == 401 || status == 403) {
                // App 개인키가 틀렸거나 설치가 제거됨
                throw new BusinessException(ErrorCode.GITHUB_AUTH_FAILED);
            }
            if (status == 404) {
                throw new BusinessException(ErrorCode.GITHUB_NOT_CONNECTED, "설치를 찾을 수 없습니다");
            }
            throw new BusinessException(ErrorCode.GITHUB_API_ERROR);
        }
    }

    /** App을 증명하는 JWT. 유효기간은 GitHub 상한(10분)보다 짧게 잡는다. */
    public String createAppJwt() {
        Instant now = Instant.now();
        return Jwts.builder()
                .issuer(properties.getAppId())
                // GitHub 서버와 시계가 어긋나도 거부되지 않도록 60초 뒤로 민다 (GitHub 공식 권고)
                .issuedAt(Date.from(now.minusSeconds(60)))
                .expiration(Date.from(now.plus(Duration.ofMinutes(9))))
                .signWith(resolvePrivateKey(), Jwts.SIG.RS256)
                .compact();
    }

    private PrivateKey resolvePrivateKey() {
        PrivateKey key = cachedPrivateKey;
        if (key != null) {
            return key;
        }
        synchronized (this) {
            if (cachedPrivateKey == null) {
                cachedPrivateKey = parsePrivateKey(properties.getPrivateKey());
            }
            return cachedPrivateKey;
        }
    }

    /**
     * GitHub이 내려주는 키는 기본이 <b>PKCS#1</b>({@code BEGIN RSA PRIVATE KEY})인데
     * Java의 {@link PKCS8EncodedKeySpec}은 PKCS#8만 읽는다. PKCS#1이면 DER 헤더를 씌워 변환한다.
     * (openssl로 미리 변환해 넣어도 그대로 동작한다)
     */
    private PrivateKey parsePrivateKey(String pem) {
        try {
            String normalized = pem.replace("\\n", "\n").trim();
            boolean pkcs1 = normalized.contains(PKCS1_HEADER);

            String base64 = normalized
                    .replace(PKCS1_HEADER, "")
                    .replace("-----END RSA PRIVATE KEY-----", "")
                    .replace(PKCS8_HEADER, "")
                    .replace("-----END PRIVATE KEY-----", "")
                    .replaceAll("\\s", "");

            byte[] der = Base64.getDecoder().decode(base64);
            if (pkcs1) {
                der = wrapPkcs1AsPkcs8(der);
            }
            return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der));
        } catch (Exception e) {
            log.error("GitHub App 개인키 파싱 실패: {}", e.getMessage());
            throw new BusinessException(ErrorCode.GITHUB_APP_NOT_CONFIGURED,
                    "GitHub App 개인키를 읽을 수 없습니다");
        }
    }

    /**
     * PKCS#1 RSAPrivateKey를 PKCS#8 PrivateKeyInfo로 감싼다.
     * SEQUENCE { INTEGER 0, SEQUENCE { OID rsaEncryption, NULL }, OCTET STRING { pkcs1 } }
     */
    private byte[] wrapPkcs1AsPkcs8(byte[] pkcs1) {
        byte[] algorithmId = new byte[]{
                0x30, 0x0d,                                              // SEQUENCE (13 bytes)
                0x06, 0x09, 0x2a, (byte) 0x86, 0x48, (byte) 0x86,        // OID 1.2.840.113549.1.1.1
                (byte) 0xf7, 0x0d, 0x01, 0x01, 0x01,
                0x05, 0x00                                               // NULL
        };
        byte[] version = new byte[]{0x02, 0x01, 0x00};                   // INTEGER 0

        byte[] octetString = derTagged((byte) 0x04, pkcs1);
        byte[] inner = concat(version, algorithmId, octetString);
        return derTagged((byte) 0x30, inner);
    }

    /** DER TLV 인코딩 — 길이가 127을 넘으면 long form을 쓴다. */
    private byte[] derTagged(byte tag, byte[] content) {
        byte[] length = derLength(content.length);
        byte[] out = new byte[1 + length.length + content.length];
        out[0] = tag;
        System.arraycopy(length, 0, out, 1, length.length);
        System.arraycopy(content, 0, out, 1 + length.length, content.length);
        return out;
    }

    private byte[] derLength(int length) {
        if (length < 0x80) {
            return new byte[]{(byte) length};
        }
        int byteCount = 0;
        for (int v = length; v > 0; v >>= 8) {
            byteCount++;
        }
        byte[] out = new byte[1 + byteCount];
        out[0] = (byte) (0x80 | byteCount);
        for (int i = byteCount; i > 0; i--) {
            out[i] = (byte) (length & 0xFF);
            length >>= 8;
        }
        return out;
    }

    private byte[] concat(byte[]... parts) {
        int total = 0;
        for (byte[] p : parts) {
            total += p.length;
        }
        byte[] out = new byte[total];
        int offset = 0;
        for (byte[] p : parts) {
            System.arraycopy(p, 0, out, offset, p.length);
            offset += p.length;
        }
        return out;
    }

    private void requireConfigured() {
        if (!properties.isConfigured()) {
            throw new BusinessException(ErrorCode.GITHUB_APP_NOT_CONFIGURED);
        }
    }
}
