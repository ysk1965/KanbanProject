package com.kanban.global.config;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

@Configuration
public class JacksonConfig {

    // ISO 8601 UTC format with 'Z' suffix
    private static final DateTimeFormatter ISO_UTC_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'");

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jacksonCustomizer() {
        return builder -> builder
                .serializers(new LocalDateTimeSerializer(ISO_UTC_FORMATTER))
                .deserializerByType(LocalTime.class, new LocalTimeDeserializer());
    }

    /**
     * Custom LocalTime deserializer that handles "24:00" as LocalTime.MAX (23:59:59.999999999).
     * Java's LocalTime only supports 00:00~23:59, but "24:00" is commonly used to mean "end of day".
     */
    private static class LocalTimeDeserializer extends JsonDeserializer<LocalTime> {
        @Override
        public LocalTime deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
            String value = p.getText().trim();
            if (value.startsWith("24:00")) {
                return LocalTime.of(23, 59, 59);
            }
            return LocalTime.parse(value);
        }
    }
}
