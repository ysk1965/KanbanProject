package com.kanban.domain.church.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 교회 API. 계약서 §3 */
public class ChurchDto {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Item {
        private String id;
        private String name;
        private String region;
        private String address;
        private long memberCount;
    }

    @Getter
    @AllArgsConstructor
    public static class Items {
        private List<Item> items;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Register {
        private String name;
        private String region;
        private String address;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class SetMine {
        private String churchId;
        private String dept;
    }

    /** 등록 결과 — created 면 201 */
    public record Registered(Item church, boolean created) {}
}
