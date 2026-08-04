package com.kanban.domain.integration.jira;

/**
 * 연결된 저장소의 자동 검증 기반 수준.
 *
 * <p>트리아지 판정 기준이 "고쳐졌음을 자동 검증할 수 있는가"이므로, 저장소에 실제로 어떤 검증
 * 수단이 있는지를 모르면 모델이 있지도 않은 테스트를 전제로 낙관적으로 판정한다. 이 값이
 * 시스템 프롬프트에 그대로 실린다.
 *
 * <p>보드마다 연결된 저장소가 다르므로 하드코딩하지 않고 설정으로 둔다.
 */
public enum TestInfraLevel {

    /** 테스트 코드가 없다. 검증하려면 테스트 기반부터 새로 만들어야 한다. */
    NONE,

    /** 일부 영역에만 테스트가 있다. 그 영역 밖은 검증 수단을 새로 만들어야 한다. */
    PARTIAL,

    /** 테스트 기반이 갖춰져 있고 CI에서 돈다. */
    MATURE;

    public static TestInfraLevel fromOrDefault(String value) {
        if (value == null || value.isBlank()) return NONE;
        try {
            return valueOf(value.toUpperCase());
        } catch (IllegalArgumentException e) {
            return NONE;
        }
    }
}
