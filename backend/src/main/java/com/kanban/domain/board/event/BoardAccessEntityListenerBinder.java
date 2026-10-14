package com.kanban.domain.board.event;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.function.Consumer;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

/** JPA 엔티티 리스너(비-빈)에 Spring {@link ApplicationEventPublisher} 를 정적으로 묶어 준다. */
@Component
@RequiredArgsConstructor
public class BoardAccessEntityListenerBinder {

    private final ApplicationEventPublisher eventPublisher;
    private Consumer<Object> bound;

    @PostConstruct
    void bind() {
        bound = eventPublisher::publishEvent;
        BoardAccessEntityListener.bind(bound);
    }

    @PreDestroy
    void unbind() {
        BoardAccessEntityListener.unbind(bound);
    }
}
