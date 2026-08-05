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

    /** 보드의 저장소 연결에 브랜치가 지정되지 않았을 때 쓸 기본 브랜치. */
    private String defaultBaseRef = "develop";

    /** 큐에 담을 최소 confidence. 트리아지가 애매하다고 본 건은 사람이 먼저 본다. */
    private double minConfidence = 0.7;

    /** 보드당 24시간 디스패치 상한. */
    private int dailyLimit = 20;

    /** 한 번에 큐에 담을 수 있는 최대 건수. */
    private int maxEnqueuePerRequest = 50;

    /**
     * 작업 명세에 실어 보낼 댓글 수 상한(최신순). 오래 끈 이슈는 댓글이 수십 개가 되는데,
     * 전부 보내면 프롬프트가 이슈 본문보다 잡담으로 채워진다.
     */
    private int maxJobComments = 20;

    /**
     * 작업 명세에 실어 보낼 자료(스크린샷·영상) 수 상한. 러너가 실제로 내려받는 양은
     * 러너 쪽에서 한 번 더 줄인다 — 서버는 목록의 크기만 책임진다.
     */
    private int maxJobMaterials = 12;

    /**
     * 이 시간이 지나도록 콜백이 없으면 회수한다. 이슈 1건에 10~40분이 걸리므로
     * 넉넉히 잡되, 무한정 두면 DISPATCHED 하나가 큐 전체를 영구히 막는다.
     */
    private int dispatchTimeoutMinutes = 90;

    /**
     * 러너가 한 건에 쓸 수 있는 시간. claim 응답에 실려 나간다.
     *
     * <p>반드시 {@link #dispatchTimeoutMinutes}보다 짧아야 한다 — 길면 서버가 먼저 TIMED_OUT으로
     * 회수해 다음 건을 내주는데 맥에서는 아직 이전 건이 돌고 있는, 정확히 피하려던 상황이 된다.
     */
    private int runnerTimeoutMinutes = 60;

    /**
     * 러너에게 작업을 내줄지. 끄면 후보를 큐에 담기만 하고 claim에는 아무것도 주지 않는다 —
     * 러너를 세우지 않고도 파이프라인을 멈출 수 있는 스위치다.
     */
    private boolean dispatchEnabled = true;

    /**
     * 종료된 작업을 슬랙 기본 채널에도 남길지. 보드에 슬랙이 연결돼 있고 기본 채널이 지정된
     * 경우에만 실제로 나가므로, 이 스위치는 "연결은 그대로 두고 알림만 끄고 싶을 때" 쓴다.
     */
    private boolean slackNotifyEnabled = true;

    /**
     * 이 시간 안에 claim이나 heartbeat가 있었으면 러너가 살아 있다고 본다.
     * 러너 폴링 주기(기본 20초)보다 넉넉해야 잠깐의 네트워크 끊김이 "오프라인"으로 보이지 않는다.
     */
    private int runnerOnlineWindowMinutes = 3;

    /**
     * 러너가 이 시간 넘게 조용하면 슬랙으로 알린다.
     *
     * <p>화면 판정({@link #runnerOnlineWindowMinutes})보다 훨씬 길게 잡는다 — 도크의 점은
     * 보고 있는 사람에게 지금을 말하는 값이라 예민해도 되지만, 알림은 사람을 부르는 행위라
     * 맥 재부팅이나 네트워크 끊김 같은 자연 회복 구간에 울리면 다음부터 무시당한다.
     */
    private int runnerOfflineAlertMinutes = 20;
}
