package com.kanban.global.email;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;

    @Value("${spring.mail.username:noreply@kanban.com}")
    private String fromEmail;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    @Async
    public void sendVerificationEmail(String toEmail, String userName, String verificationToken) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(toEmail);
            helper.setSubject("[BRIDGE SPOTS] 이메일 인증을 완료해주세요");

            // Create Thymeleaf context
            Context context = new Context();
            context.setVariable("userName", userName);
            context.setVariable("verificationLink", frontendUrl + "/verify-email/" + verificationToken);

            // Process template
            String htmlContent = templateEngine.process("verification-email", context);
            helper.setText(htmlContent, true);

            mailSender.send(message);
            log.info("Verification email sent to: {}", toEmail);

        } catch (MessagingException e) {
            log.error("Failed to send verification email to: {}", toEmail, e);
            throw new RuntimeException("이메일 발송에 실패했습니다.", e);
        }
    }

    @Async
    public void sendPasswordResetEmail(String toEmail, String userName, String resetToken) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(toEmail);
            helper.setSubject("[BRIDGE SPOTS] 비밀번호 재설정");

            // Create Thymeleaf context
            Context context = new Context();
            context.setVariable("userName", userName);
            context.setVariable("resetLink", frontendUrl + "/reset-password/" + resetToken);

            // Process template
            String htmlContent = templateEngine.process("password-reset-email", context);
            helper.setText(htmlContent, true);

            mailSender.send(message);
            log.info("Password reset email sent to: {}", toEmail);

        } catch (MessagingException e) {
            log.error("Failed to send password reset email to: {}", toEmail, e);
            throw new RuntimeException("이메일 발송에 실패했습니다.", e);
        }
    }

    @Async
    public void sendInviteEmail(String toEmail, String boardName, String inviterName, String inviteCode, String role) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(toEmail);
            helper.setSubject("[Team Kanban] " + inviterName + "님이 \"" + boardName + "\" 보드에 초대했습니다");

            // Create Thymeleaf context
            Context context = new Context();
            context.setVariable("boardName", boardName);
            context.setVariable("inviterName", inviterName);
            context.setVariable("role", getRoleDisplayName(role));
            context.setVariable("inviteLink", frontendUrl + "/invite/" + inviteCode);
            context.setVariable("frontendUrl", frontendUrl);

            // Process template
            String htmlContent = templateEngine.process("invite-email", context);
            helper.setText(htmlContent, true);

            mailSender.send(message);
            log.info("Invite email sent to: {}", toEmail);

        } catch (MessagingException e) {
            log.error("Failed to send invite email to: {}", toEmail, e);
            throw new RuntimeException("이메일 발송에 실패했습니다.", e);
        }
    }

    private String getRoleDisplayName(String role) {
        return switch (role.toUpperCase()) {
            case "ADMIN" -> "Admin (관리자)";
            case "MEMBER" -> "Member (멤버)";
            case "VIEWER" -> "Observer (읽기 전용)";
            default -> role;
        };
    }
}
