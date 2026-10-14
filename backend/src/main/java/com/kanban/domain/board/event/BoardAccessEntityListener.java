package com.kanban.domain.board.event;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.OrganizationMember;
import com.kanban.domain.user.User;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreRemove;
import jakarta.persistence.PreUpdate;
import java.util.function.Consumer;
import lombok.extern.slf4j.Slf4j;

/**
 * 보드 접근 권한에 영향을 주는 엔티티 변경을 JPA 콜백에서 잡아 이벤트로 흘린다 — 어떤 서비스도 캐시 무효화를
 * 잊을 수 없게.
 *
 * <p>붙는 엔티티: {@link BoardMember}, {@link OrganizationMember}, {@link User}(systemRole 변경·삭제),
 * {@link Board}(소속 조직 변경·삭제), {@link Organization}(autoBoardAccessEnabled 변경·삭제). User/Board/Organization
 * 은 자주 바뀌는 엔티티라 {@code @PostLoad} 스냅샷과 비교해 <b>관련 필드가 실제로 바뀐 경우에만</b> 발행한다
 * (매 로그인마다 Redis SCAN 을 돌리지 않기 위해).
 *
 * <p>Pre* 콜백을 쓰는 이유: {@code persist()}/{@code remove()} 시점에 즉시 불려 같은 트랜잭션 안에서 바로 이어지는
 * 권한 체크도 새 상태를 보게 된다(Post* 는 flush 까지 미뤄진다). 커밋 뒤 무효화는
 * {@code BoardAccessCacheEvictor} 가 after-commit synchronization 으로 한 번 더 한다.
 *
 * <p>JPA 엔티티 리스너는 Spring 빈이 아니므로 {@link BoardAccessEntityListenerBinder} 가 기동 시 정적으로
 * 퍼블리셔를 묶어 준다. 바인딩 전(컨텍스트 기동 중)에는 조용히 무시한다 — 그 시점엔 캐시도 비어 있다.
 *
 * <p>주의: {@code @Modifying} JPQL/네이티브 벌크 문은 이 콜백을 타지 않는다. 그런 지점은 서비스에서
 * {@code BoardAccessCacheEvictor} 를 직접 부른다.
 */
@Slf4j
public class BoardAccessEntityListener {

    private static volatile Consumer<Object> publisher;

    static void bind(Consumer<Object> eventPublisher) {
        publisher = eventPublisher;
    }

    static void unbind(Consumer<Object> eventPublisher) {
        if (publisher == eventPublisher) {
            publisher = null;
        }
    }

    @PrePersist
    public void onPersist(Object entity) {
        if (entity instanceof BoardMember member) {
            publishMembership(member);
        } else if (entity instanceof OrganizationMember member) {
            publishOrgMembership(member);
        }
        // Board / User / Organization 신규 생성은 기존 캐시 엔트리를 바꾸지 않는다 (ID 가 새 UUID).
    }

    @PreUpdate
    public void onUpdate(Object entity) {
        if (entity instanceof BoardMember member) {
            publishMembership(member);
        } else if (entity instanceof OrganizationMember member) {
            publishOrgMembership(member);
        } else if (entity instanceof User user) {
            if (user.systemRoleChangedSinceLoad()) {
                publish(new UserSystemRoleChangedEvent(user.getId()));
            }
        } else if (entity instanceof Board board) {
            if (board.organizationChangedSinceLoad()) {
                publish(new BoardAccessScopeChangedEvent(board.getId()));
            }
        } else if (entity instanceof Organization org) {
            if (org.autoBoardAccessChangedSinceLoad()) {
                publish(new OrgSettingsChangedEvent(org.getId()));
            }
        }
    }

    @PreRemove
    public void onRemove(Object entity) {
        if (entity instanceof BoardMember member) {
            publishMembership(member);
        } else if (entity instanceof OrganizationMember member) {
            publishOrgMembership(member);
        } else if (entity instanceof User user) {
            publish(new UserSystemRoleChangedEvent(user.getId()));
        } else if (entity instanceof Board board) {
            publish(new BoardAccessScopeChangedEvent(board.getId()));
        } else if (entity instanceof Organization org) {
            publish(new OrgSettingsChangedEvent(org.getId()));
        }
    }

    private void publishMembership(BoardMember member) {
        if (member.getBoard() == null || member.getUser() == null) {
            return;
        }
        publish(new BoardMembershipChangedEvent(
                member.getBoard().getId(), member.getUser().getId()));
    }

    private void publishOrgMembership(OrganizationMember member) {
        if (member.getOrganization() == null || member.getUser() == null) {
            return;
        }
        publish(new OrgMembershipChangedEvent(
                member.getOrganization().getId(), member.getUser().getId()));
    }

    private static void publish(Object event) {
        Consumer<Object> target = publisher;
        if (target == null) {
            log.debug("BoardAccessEntityListener not bound — dropping {}", event);
            return;
        }
        target.accept(event);
    }
}
