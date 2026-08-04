package com.kanban.domain.integration.jira.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 자동수정 큐 운영 파라미터. 전부 가드레일이라 기본값을 보수적으로 잡는다 —
 * 검증되지 않은 파이프라인이 밤새 100건을 쏟아내면 리뷰 부담이 자동화 이득을 넘는다.
 */
@Configuration
@ConfigurationProperties(prefix = "autofix")
@Getter
@Setter
public class AutofixProperties {

    /** 대상 저장소에 둘 워크플로 파일명. */
    private String workflowFile = "autofix.yaml";

    /** 보드의 저장소 연결에 브랜치가 지정되지 않았을 때 쓸 기본 브랜치. */
    private String defaultBaseRef = "develop";

    /** 큐에 담을 최소 confidence. 트리아지가 애매하다고 본 건은 사람이 먼저 본다. */
    private double minConfidence = 0.7;

    /** 보드당 24시간 디스패치 상한. */
    private int dailyLimit = 20;

    /** 한 번에 큐에 담을 수 있는 최대 건수. */
    private int maxEnqueuePerRequest = 50;

    /**
     * 이 시간이 지나도록 콜백이 없으면 회수한다. 이슈 1건에 10~40분이 걸리므로
     * 넉넉히 잡되, 무한정 두면 DISPATCHED 하나가 큐 전체를 영구히 막는다.
     */
    private int dispatchTimeoutMinutes = 90;

    /** 큐 펌프 사용 여부. 끄면 수동 디스패치만 가능하다. */
    private boolean schedulerEnabled = true;
}
