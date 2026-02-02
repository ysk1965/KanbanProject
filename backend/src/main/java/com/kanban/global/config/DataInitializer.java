package com.kanban.global.config;

import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@Profile("!prod")
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        createTestAccount();
    }

    private void createTestAccount() {
        String testEmail = "admin@test.com";
        String testPassword = "admin123";

        if (userRepository.existsByEmail(testEmail)) {
            log.info("Test account already exists: {}", testEmail);
            return;
        }

        User testUser = User.builder()
                .email(testEmail)
                .passwordHash(passwordEncoder.encode(testPassword))
                .name("Admin")
                .authProvider("email")
                .emailVerified(true)
                .build();

        userRepository.save(testUser);
        log.info("Test account created: {}", testEmail);
    }
}
