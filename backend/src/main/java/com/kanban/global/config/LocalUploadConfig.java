package com.kanban.global.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 로컬 업로드 파일을 /uploads/** 경로로 서빙 (개발용)
 */
@Configuration
@ConditionalOnProperty(name = "app.file.s3-enabled", havingValue = "false", matchIfMissing = true)
public class LocalUploadConfig implements WebMvcConfigurer {

    @Value("${app.file.local-dir:./uploads}")
    private String localDir;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:" + localDir + "/");
    }
}
