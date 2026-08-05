package com.kanban.domain.integration.jira;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.kanban.domain.integration.jira.dto.JiraAutofixResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 서버가 내려주는 작업 명세와 맥의 러너 스크립트가 <b>같은 계약</b>을 말하는지 확인한다.
 *
 * <p><b>왜 이 테스트가 있는가.</b> 러너 스크립트는 이 저장소에 있지만 실행은 맥에 복사된 사본이 한다.
 * 서버 DTO의 필드를 리네임해도 컴파일러는 아무 말도 하지 않고(스크립트는 문자열로 키를 읽는다),
 * 단위 테스트도 통과하고, CI도 통과한다. 어긋남은 <b>배포된 뒤 맥에서만</b> 드러난다.
 *
 * <p>2026-08-05에 실제로 그렇게 멈췄다. {@code jira_issue_key → job_key} 리네임 뒤 구버전 러너가
 * 키를 못 읽어 매 건을 실패시켰고, 실패 한 건이 90분씩 큐 전체를 막았다. 그날의 교훈은
 * {@code JiraAutofixRepositoryQueryTest}가 JPQL에 대해 세운 것과 같다 —
 * <b>문자열로 이어진 경계는 테스트가 실제로 한 번 이어 봐야 한다.</b>
 *
 * <p>스크립트를 실행하지는 않는다(맥·Unity·claude CLI가 필요하다). 대신 스크립트가 어떤 키를
 * 읽는지를 소스에서 뽑아 서버 DTO의 직렬화 키와 대조한다.
 */
@DisplayName("자동수정 러너 계약")
class JiraAutofixRunnerContractTest {

    /** 테스트 작업 디렉터리는 {@code backend/}다. 러너 스크립트는 저장소 루트 아래에 있다. */
    private static final Path RUNNER_DIR = Path.of("..", "tools", "autofix", "runner");

    /**
     * 러너가 명세에서 읽는 키: {@code JOB_KEY=$(field job_key)} 형태.
     * {@code field()}가 유일한 진입점이라 이 한 패턴이 전부를 잡는다.
     */
    private static final Pattern FIELD_READ = Pattern.compile("\\$\\(field\\s+([a-z0-9_]+)\\)");

    /** {@code .timeout_minutes // 60} 처럼 jq로 직접 읽는 키. */
    private static final Pattern JQ_READ = Pattern.compile("jq -r '\\.([a-z0-9_]+)");

    private static final Pattern RUNNER_CONTRACT =
            Pattern.compile("^RUNNER_CONTRACT=(\\d+)", Pattern.MULTILINE);

    /**
     * 러너가 무시해도 되는 필드.
     *
     * <p>{@code job_kind}는 서버가 출처를 밝히는 값이고 러너는 출처별 분기를 갖지 않기로 했다
     * (분기가 생기면 프롬프트를 고칠 때마다 맥에 재배포해야 한다). 로그·디버깅용으로만 존재한다.
     */
    private static final Set<String> OPTIONAL_FOR_RUNNER = Set.of("job_kind");

    @Test
    @DisplayName("러너가 읽는 키가 서버 명세에 모두 존재한다")
    void runnerReadsOnlyKeysTheServerSends() throws IOException {
        Set<String> served = serializedRunnerJobKeys();
        Set<String> read = keysReadByRunner();

        assertThat(read)
                .describedAs("러너 스크립트가 읽는 키 중 서버가 보내지 않는 것이 있다. "
                        + "서버가 보내는 키: %s", served)
                .isSubsetOf(served);
    }

    /**
     * 반대 방향 — 서버가 보내는 키를 러너가 하나도 빠뜨리지 않았는지.
     *
     * <p>여기서는 "{@code field}로 읽었는가"까지 따지지 않고 <b>스크립트 어딘가에 그 키가
     * 등장하는가</b>만 본다. 배열 필드는 읽는 방식이 제각각이라
     * ({@code jq '(.materials // []) | length'}, {@code jq -r ".materials[$i].url"} …)
     * 정밀한 패턴을 유지하려 들면 테스트가 스크립트 스타일을 강제하게 된다.
     * 이 테스트가 잡아야 하는 사고는 <b>리네임 뒤 스크립트에서 그 키가 사라지는 것</b>이고,
     * 등장 여부만 봐도 그건 잡힌다.
     */
    @Test
    @DisplayName("서버가 보내는 필수 키를 러너가 빠짐없이 읽는다")
    void runnerReadsEveryKeyTheServerSends() throws IOException {
        Set<String> served = serializedRunnerJobKeys();
        String sources = runnerSources();

        Set<String> ignored = served.stream()
                .filter(k -> !Pattern.compile("[.\\s\"]" + Pattern.quote(k) + "\\b").matcher(sources).find())
                .filter(k -> !OPTIONAL_FOR_RUNNER.contains(k))
                .collect(Collectors.toSet());

        assertThat(ignored)
                .describedAs("서버가 보내는데 러너가 읽지 않는 키다. 새 필드를 추가했다면 "
                        + "tools/autofix/runner/ 도 함께 고치고, 의도적으로 무시하는 것이면 "
                        + "OPTIONAL_FOR_RUNNER 에 이유와 함께 등록할 것")
                .isEmpty();
    }

    @Test
    @DisplayName("러너 스크립트의 계약 버전이 서버 상수와 같다")
    void contractVersionsAgree() throws IOException {
        String script = Files.readString(RUNNER_DIR.resolve("bridge-autofix-runner.sh"));
        Matcher m = RUNNER_CONTRACT.matcher(script);

        assertThat(m.find())
                .describedAs("bridge-autofix-runner.sh 에 RUNNER_CONTRACT 선언이 없다")
                .isTrue();

        assertThat(Integer.parseInt(m.group(1)))
                .describedAs("명세 필드를 바꿨다면 AutofixRunnerContract.VERSION 과 "
                        + "bridge-autofix-runner.sh 의 RUNNER_CONTRACT 를 같은 커밋에서 함께 올릴 것")
                .isEqualTo(AutofixRunnerContract.VERSION);
    }

    /**
     * 실제 {@code ObjectMapper}로 직렬화해 키를 뽑는다.
     *
     * <p>필드명을 읽어 손으로 snake_case로 바꾸지 않는 이유: 그러면 이 테스트가 Jackson의 실제
     * 동작이 아니라 <b>내 짐작</b>을 검사하게 된다. 네이밍 전략은 서버 설정(application.yml)의
     * {@code SNAKE_CASE}와 같은 것을 쓴다.
     */
    private Set<String> serializedRunnerJobKeys() {
        ObjectMapper mapper = new ObjectMapper()
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);

        JiraAutofixResponse.RunnerJob job = JiraAutofixResponse.RunnerJob.builder()
                .jobId("id").jobKey("QASA-1").jobKind("JIRA")
                .title("t").instruction("i")
                .repoFullName("o/r").baseRef("develop").branch("autofix/QASA-1")
                .timeoutMinutes(60)
                .comments(List.of())
                .materials(List.of())
                .build();

        @SuppressWarnings("unchecked")
        Map<String, Object> asMap = mapper.convertValue(job, Map.class);
        return asMap.keySet();
    }

    private String runnerSources() throws IOException {
        return Files.readString(RUNNER_DIR.resolve("autofix-once.sh"))
                + Files.readString(RUNNER_DIR.resolve("bridge-autofix-runner.sh"));
    }

    /** 러너 스크립트 두 개가 명세에서 읽는 키 전부. */
    private Set<String> keysReadByRunner() throws IOException {
        String sources = runnerSources();

        Set<String> keys = FIELD_READ.matcher(sources).results()
                .map(r -> r.group(1))
                .collect(Collectors.toCollection(java.util.HashSet::new));

        JQ_READ.matcher(sources).results()
                .map(r -> r.group(1))
                .forEach(keys::add);

        // 러너 루프는 `.job.job_key` 처럼 한 겹 감싼 응답에서도 읽는다. 그쪽은 claim 응답 필드라
        // 명세 키가 아니다 — 아래 두 개만 제외하면 나머지는 전부 명세 키다.
        keys.remove("job");
        keys.remove("reason");
        keys.remove("contract_version");
        return keys;
    }
}
