package com.kanban.domain.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class GoogleAuthRequest {

    private String id_token;
    private String code;

    public String getIdToken() {
        return id_token;
    }

    public String getCode() {
        return code;
    }
}
