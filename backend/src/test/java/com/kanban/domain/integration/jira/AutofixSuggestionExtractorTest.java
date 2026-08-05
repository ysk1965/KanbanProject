package com.kanban.domain.integration.jira;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 보고 블록 추출.
 *
 * <p>고정 문자열은 실제 러너 로그(QASA-116, 2026-08-05)에서 그대로 옮겼다. 형식이 바뀌면
 * 여기가 먼저 깨져야 한다 — 프롬프트만 바꾸고 서버를 안 고치면 화면에서 조용히 아무것도
 * 안 나오게 되는데, 그 침묵은 배포 뒤 며칠이 지나야 발견된다.
 */
class AutofixSuggestionExtractorTest {

    private static final String REAL_LOG = """
            Unity 콘솔에는 이 건과 관련된 에러 없음(URP Compatibility Mode / prefab Image 경고만).
            첨부 자료는 스크린샷 1건이 전부이며 모두 열어 확인했습니다.

            ---

              [로컬라이즈 원본 수정 필요]
              - 항목: #id `4`, key `MSG_NOT_ENOUGH_AP`
              - 언어: kr
              - 현재: 행동력이 부족합니다.
              - 변경: 스테미너가 부족합니다.
              - 근거: QASA-116 기대결과 문장 그대로.

              [로컬라이즈 원본 수정 필요]
              - 항목: #id `4`, key `MSG_NOT_ENOUGH_AP`
              - 언어: en
              - 현재: 행동력이 부족합니다.  ← en 열에 한국어가 그대로 들어가 있음
              - 변경: (영문 확정 문구 필요)
              - 근거: `Default_en.asset:3185`가 ko와 동일한 한국어 값.
            """;

    @Test
    @DisplayName("실제 러너 로그에서 보고 블록만 뽑는다 — 앞의 서술은 버린다")
    void 실제_로그에서_블록만_뽑는다() {
        String result = AutofixSuggestionExtractor.extract(REAL_LOG);

        assertThat(result).isNotNull();
        assertThat(result).doesNotContain("Unity 콘솔에는");
        assertThat(result).doesNotContain("---");
        assertThat(result).contains("[로컬라이즈 원본 수정 필요]");
        assertThat(result).contains("- 언어: kr");
        assertThat(result).contains("- 언어: en");
        // 두 블록이 각각 살아 있어야 한다. 하나로 뭉치면 어느 값이 어느 언어의 것인지 사라진다.
        assertThat(result.split("\\[로컬라이즈 원본 수정 필요]")).hasSize(3);
    }

    @Test
    @DisplayName("들여쓰기를 걷어내 댓글에 그대로 붙일 수 있게 한다")
    void 들여쓰기를_걷어낸다() {
        String result = AutofixSuggestionExtractor.extract(REAL_LOG);

        assertThat(result).startsWith("[로컬라이즈 원본 수정 필요]");
        assertThat(result).doesNotContain("\n  - ");
    }

    @Test
    @DisplayName("추가 필요 블록도 같은 규약으로 읽는다")
    void 추가_필요_블록도_읽는다() {
        String log = """
            [로컬라이즈 원본 추가 필요]
            - 제안 키: MSG_NOT_ENOUGH_STAMINA
            - 값(kr): 스테미너가 부족합니다.
            """;

        assertThat(AutofixSuggestionExtractor.extract(log))
                .contains("[로컬라이즈 원본 추가 필요]")
                .contains("- 제안 키: MSG_NOT_ENOUGH_STAMINA");
    }

    @Test
    @DisplayName("로케일이 아닌 사유 블록도 읽는다 — no_change 전반이 대상이다")
    void 사람이_해야_할_일_블록도_읽는다() {
        String log = """
            [사람이 해야 할 일]
            - 이유: 재현 경로가 서버 응답에 달려 있어 코드만으로 판단 불가
            - 필요: QA가 재현 시 네트워크 로그 첨부
            """;

        assertThat(AutofixSuggestionExtractor.extract(log)).contains("[사람이 해야 할 일]");
    }

    @Test
    @DisplayName("줄바꿈된 뒷부분은 앞줄에 이어 붙인다")
    void 줄바꿈된_뒷부분을_이어_붙인다() {
        String log = """
            [로컬라이즈 원본 수정 필요]
            - 항목: key `MSG_NOT_ENOUGH_AP`
            - 근거: 이 문장은 아주 길어서
            다음 줄로 넘어갔다
            """;

        String result = AutofixSuggestionExtractor.extract(log);
        assertThat(result).contains("- 근거: 이 문장은 아주 길어서 다음 줄로 넘어갔다");
    }

    /**
     * 에이전트 로그 파일에는 러너 자신의 로그가 뒤이어 붙는다. 실제로 QASA-116에서 마지막
     * 항목의 근거 끝에 {@code [12:08:59] 변경 없음 …}이 이어 붙어 나왔다 — 사람이 원본에
     * 옮겨 적을 값 끝에 로그가 섞이면 그 대조는 거기서부터 어긋난다.
     */
    @Test
    @DisplayName("보고 뒤에 붙은 러너 로그는 값에 섞이지 않는다")
    void 러너_로그는_값에_섞이지_않는다() {
        String log = """
              [로컬라이즈 원본 수정 필요]
              - 항목: key `MSG_NOT_ENOUGH_AP`
              - 변경: 스테미너가 부족합니다.
            [12:08:59] 변경 없음 — 에이전트가 고칠 수 없다고 판단했다
            /Users/x/autofix-once.sh: line 163: 62563 Terminated: 15  heartbeat_loop
            """;

        String result = AutofixSuggestionExtractor.extract(log);
        assertThat(result).contains("- 변경: 스테미너가 부족합니다.");
        assertThat(result).doesNotContain("12:08:59");
        assertThat(result).doesNotContain("heartbeat_loop");
    }

    @Test
    @DisplayName("머리글만 남은 블록은 버린다")
    void 머리글만_남은_블록은_버린다() {
        assertThat(AutofixSuggestionExtractor.extract("[로컬라이즈 원본 수정 필요]")).isNull();
        assertThat(AutofixSuggestionExtractor.extract("""
            [로컬라이즈 원본 수정 필요]

            그 다음은 평범한 서술이다.
            """)).isNull();
    }

    /**
     * 꼬리만 남은 로그. 앞 블록은 머리글째 잘려 나가므로 수집이 시작되지 않고, 뒤에 온
     * 온전한 블록만 살아남는다 — 반쪽짜리 항목이 사람 앞에 놓이지 않는 것이 요점이다.
     */
    @Test
    @DisplayName("앞이 잘린 로그에서는 온전한 블록만 남는다")
    void 앞이_잘린_로그에서는_온전한_블록만_남는다() {
        String truncated = """
            - 현재: 행동력이 부족합니다.
            - 변경: 스테미너가 부족합니다.

            [로컬라이즈 원본 수정 필요]
            - 항목: key `UI_AP_MAX_UP`
            - 변경: 스테미너 최대치 상승
            """;

        String result = AutofixSuggestionExtractor.extract(truncated);
        assertThat(result).isNotNull();
        assertThat(result).doesNotContain("행동력이 부족합니다");
        assertThat(result).contains("UI_AP_MAX_UP");
    }

    @Test
    @DisplayName("보고가 없는 평범한 로그에서는 아무것도 뽑지 않는다")
    void 보고가_없으면_null() {
        assertThat(AutofixSuggestionExtractor.extract("빌드 성공\n테스트 12개 통과")).isNull();
        assertThat(AutofixSuggestionExtractor.extract("")).isNull();
        assertThat(AutofixSuggestionExtractor.extract(null)).isNull();
    }
}
