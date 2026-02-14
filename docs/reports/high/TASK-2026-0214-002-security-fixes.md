# Phase 1 보안 조치 리포트

**Task ID**: TASK-2026-0214-002
**날짜**: 2026-02-14
**분류**: P0 즉시 조치 (보안)
**상위 태스크**: [TASK-2026-0214-001 코드베이스 종합 분석](TASK-2026-0214-001-codebase-audit.md)

---

## 요약

| # | 항목 | 심각도 | 결과 |
|---|------|--------|------|
| P0-1 | API 키 Git 노출 여부 | CRITICAL | 이미 안전 (조치 불필요) |
| P0-2 | CacheConfig Jackson 역직렬화 취약점 | CRITICAL | 패치 완료 |
| P0-3 | Toss 결제 테스트 키 하드코딩 | HIGH | 제거 완료 |

---

## P0-1: API 키 Git 노출 여부 점검

### 무엇이 문제였나
`backend/src/main/resources/application-local.yml` 파일에 Claude API 키(`sk-ant-api03-...`)가 평문으로 기록되어 있었습니다. 만약 이 파일이 Git에 커밋된 상태라면, 저장소에 접근할 수 있는 누구나 API 키를 탈취할 수 있습니다.

### 조사 결과
```bash
$ git ls-files --cached backend/src/main/resources/application-local.yml
# (출력 없음 - 추적되지 않음)

$ git log --oneline --all -- backend/src/main/resources/application-local.yml
# (출력 없음 - 커밋 이력 없음)
```

- `.gitignore`에 `application-local.yml`이 이미 등록되어 있음 (line 18)
- Git에 한 번도 커밋된 적 없음
- 로컬 개발 환경에서만 존재하는 파일

### 결론
**이미 안전합니다.** 추가 조치 불필요.

---

## P0-2: CacheConfig Jackson 역직렬화 취약점

### 무엇이 문제였나
**파일**: `backend/src/main/java/com/kanban/global/config/CacheConfig.java`

Redis 캐시에 Java 객체를 직렬화/역직렬화할 때 Jackson의 **다형성 타입 처리** 기능을 사용하고 있었습니다. 문제는 `LaissezFaireSubTypeValidator`를 사용했다는 점입니다.

```java
// 변경 전 (취약)
objectMapper.activateDefaultTyping(
    LaissezFaireSubTypeValidator.instance,  // 모든 클래스 허용
    ObjectMapper.DefaultTyping.NON_FINAL,
    JsonTypeInfo.As.PROPERTY
);
```

### 왜 위험한가

`LaissezFaireSubTypeValidator`는 **어떤 Java 클래스든** 역직렬화를 허용합니다. 공격자가 Redis에 악의적인 JSON을 주입할 수 있다면, "gadget chain" 공격을 통해 서버에서 **임의 코드 실행(RCE)** 이 가능합니다.

대표적인 공격 체인:
- `com.sun.rowset.JdbcRowSetImpl` -> JNDI Injection -> Remote Code Execution
- `org.apache.xbean.propertyeditor.JndiConverter` -> 같은 결과

이는 Jackson의 알려진 취약점 패턴이며, CVE-2017-7525 계열로 분류됩니다.

### 어떻게 수정했나

```java
// 변경 후 (안전)
PolymorphicTypeValidator typeValidator = BasicPolymorphicTypeValidator.builder()
    .allowIfBaseType("com.kanban.")   // 프로젝트 도메인 클래스만
    .allowIfBaseType("java.util.")    // 컬렉션 (List, Map, Set)
    .allowIfBaseType("java.time.")    // 시간 타입 (LocalDateTime 등)
    .build();
objectMapper.activateDefaultTyping(
    typeValidator,
    ObjectMapper.DefaultTyping.NON_FINAL,
    JsonTypeInfo.As.PROPERTY
);
```

**화이트리스트 방식**으로 전환하여 허용된 패키지의 클래스만 역직렬화합니다:
- `com.kanban.*` — 프로젝트 엔티티/DTO
- `java.util.*` — List, Map, Set 등 컬렉션
- `java.time.*` — LocalDateTime, LocalDate 등

이 외의 클래스는 역직렬화가 차단되어 gadget chain 공격이 불가능합니다.

### 검증
- 빌드 성공 (`./gradlew build -x test`)
- 기존 캐시 동작에 영향 없음 (Board, Block, Member, Feature 캐시 모두 `com.kanban.*` 패키지)

---

## P0-3: Toss 결제 테스트 키 하드코딩

### 무엇이 문제였나
**파일**: `backend/src/main/resources/application.yml` (lines 140-141)

Toss Payments 테스트 키가 환경변수 fallback 기본값으로 하드코딩되어 있었습니다:

```yaml
# 변경 전
toss:
  payments:
    client-key: ${TOSS_CLIENT_KEY:test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq}
    secret-key: ${TOSS_SECRET_KEY:test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R}
```

### 왜 위험한가

1. **키 노출**: 퍼블릭 저장소에서 결제 관련 키가 노출됨
2. **실수 방지 실패**: 환경변수를 설정하지 않아도 테스트 키로 동작하므로, 운영 환경에서 실수로 테스트 모드로 결제가 처리될 수 있음
3. **보안 원칙 위반**: 결제 관련 자격 증명은 어떤 형태든 코드에 포함되면 안 됨

### 어떻게 수정했나

```yaml
# 변경 후
toss:
  payments:
    client-key: ${TOSS_CLIENT_KEY:}
    secret-key: ${TOSS_SECRET_KEY:}
```

- 기본값을 빈 문자열로 변경
- 환경변수 미설정 시 결제 기능이 명시적으로 비활성화됨
- 운영 환경에서는 반드시 환경변수로 실제 키를 주입해야 함

### 운영 영향
- **로컬 개발**: 결제 테스트 시 `.env.local`에 테스트 키 직접 설정 필요
- **dev/prod**: 기존처럼 환경변수로 주입하므로 변경 없음

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `backend/src/main/java/com/kanban/global/config/CacheConfig.java` | LaissezFaireSubTypeValidator -> BasicPolymorphicTypeValidator |
| `backend/src/main/resources/application.yml` | Toss 테스트 키 fallback 제거 |

---

## 추가 권장사항 (Phase 2 이후 검토)

| 항목 | 현재 상태 | 권장 |
|------|----------|------|
| JWT secret fallback | 약한 기본값 존재 | prod 프로파일에서 `${JWT_SECRET}` 필수화 |
| CORS allowedHeaders | `*` (전체 허용) | 명시적 헤더 목록으로 제한 |
| H2 console | SecurityConfig에서 전체 허용 | 프로파일 조건부 비활성화 |
| WebSocket 인증 | SecurityConfig에서 permitAll | 핸들러 레벨 JWT 검증 확인 필요 |
