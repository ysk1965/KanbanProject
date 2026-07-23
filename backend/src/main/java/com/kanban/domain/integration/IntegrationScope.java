package com.kanban.domain.integration;

/**
 * 외부 연동의 인증 소유 단위.
 *
 * <p>인증(누구의 자격으로 접근하나)과 선택(이 보드는 무엇을 보나)을 분리하기 위한 축.
 * 조직에 한 번 연결해 두면 그 조직의 모든 보드가 재인증 없이 대상만 고르면 된다.
 * 조직에 속하지 않은 개인 보드는 {@link #BOARD}로 폴백한다.
 *
 * <p>{@code SlackInstallScope}와 같은 개념이지만, Slack은 이미 자체 enum을 쓰고 있어
 * 신규 연동(GitHub·Confluence)만 이 공용 enum을 공유한다.
 */
public enum IntegrationScope {
    BOARD,
    ORGANIZATION
}
