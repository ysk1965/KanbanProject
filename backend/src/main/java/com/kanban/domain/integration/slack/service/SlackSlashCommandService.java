package com.kanban.domain.integration.slack.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.integration.slack.SlackInstallation;
import com.kanban.domain.integration.slack.SlackInstallationRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class SlackSlashCommandService {

    private final SlackInstallationRepository installationRepository;
    private final TaskRepository taskRepository;

    /**
     * Handle incoming slash command
     */
    @Transactional(readOnly = true)
    public Map<String, Object> handleCommand(String command, String text, String teamId,
                                               String channelId, String slackUserId, String userName) {
        // Find installation by team
        List<SlackInstallation> installations = installationRepository.findActiveByTeamId(teamId);
        if (installations.isEmpty()) {
            return ephemeralResponse("BRIDGE \uc571\uc774 \uc124\uce58\ub418\uc5b4 \uc788\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.");
        }

        // Parse subcommand
        String subcommand = "";
        String args = "";
        if (text != null && !text.isBlank()) {
            String[] parts = text.trim().split("\\s+", 2);
            subcommand = parts[0].toLowerCase();
            args = parts.length > 1 ? parts[1] : "";
        }

        return switch (subcommand) {
            case "list" -> handleList(installations);
            case "status" -> handleStatus(installations, args);
            case "help" -> handleHelp();
            default -> handleHelp();
        };
    }

    private Map<String, Object> handleList(List<SlackInstallation> installations) {
        List<Map<String, Object>> blocks = new ArrayList<>();
        blocks.add(Map.of("type", "header",
                "text", Map.of("type", "plain_text", "text", "\uD83D\uDCCB BRIDGE Tasks", "emoji", true)));

        for (SlackInstallation installation : installations) {
            Board board = installation.getBoard();
            if (board == null) continue;

            List<Task> tasks = taskRepository.findTop10ByBoardIdOrderByUpdatedAtDesc(board.getId());
            if (tasks.isEmpty()) continue;

            StringBuilder sb = new StringBuilder();
            sb.append("*").append(board.getName()).append("*\n");
            for (Task task : tasks) {
                String status = task.getBlock() != null ? task.getBlock().getName() : "N/A";
                sb.append("\u2022 ").append(task.getTitle()).append(" [").append(status).append("]\n");
            }

            blocks.add(Map.of("type", "section",
                    "text", Map.of("type", "mrkdwn", "text", sb.toString())));
        }

        if (blocks.size() == 1) {
            blocks.add(Map.of("type", "section",
                    "text", Map.of("type", "mrkdwn", "text", "\ub4f1\ub85d\ub41c \ud0dc\uc2a4\ud06c\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.")));
        }

        return Map.of("response_type", "ephemeral", "blocks", blocks);
    }

    private Map<String, Object> handleStatus(List<SlackInstallation> installations, String taskTitle) {
        if (taskTitle.isBlank()) {
            return ephemeralResponse("\uc0ac\uc6a9\ubc95: `/bridge status [\ud0dc\uc2a4\ud06c \uc81c\ubaa9]`");
        }

        for (SlackInstallation installation : installations) {
            Board board = installation.getBoard();
            if (board == null) continue;

            List<Task> tasks = taskRepository.findByBoardIdAndTitleContainingIgnoreCase(board.getId(), taskTitle);
            if (!tasks.isEmpty()) {
                Task task = tasks.get(0);
                String status = task.getBlock() != null ? task.getBlock().getName() : "N/A";
                String feature = task.getFeature() != null ? task.getFeature().getTitle() : "N/A";

                List<Map<String, Object>> blocks = new ArrayList<>();
                blocks.add(Map.of("type", "header",
                        "text", Map.of("type", "plain_text", "text", "\uD83D\uDD0D Task Status", "emoji", true)));
                blocks.add(Map.of("type", "section",
                        "fields", List.of(
                                Map.of("type", "mrkdwn", "text", "*Task:*\n" + task.getTitle()),
                                Map.of("type", "mrkdwn", "text", "*Status:*\n" + status),
                                Map.of("type", "mrkdwn", "text", "*Feature:*\n" + feature),
                                Map.of("type", "mrkdwn", "text", "*Board:*\n" + board.getName())
                        )));

                return Map.of("response_type", "ephemeral", "blocks", blocks);
            }
        }

        return ephemeralResponse("'" + taskTitle + "' \ud0dc\uc2a4\ud06c\ub97c \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.");
    }

    private Map<String, Object> handleHelp() {
        String helpText = "*BRIDGE Slash Commands*\n\n"
                + "\u2022 `/bridge list` \u2014 \ucd5c\uadfc \ud0dc\uc2a4\ud06c \ubaa9\ub85d\n"
                + "\u2022 `/bridge status [\ud0dc\uc2a4\ud06c \uc81c\ubaa9]` \u2014 \ud0dc\uc2a4\ud06c \uc0c1\ud0dc \uc870\ud68c\n"
                + "\u2022 `/bridge help` \u2014 \uc774 \ub3c4\uc6c0\ub9d0\n";

        return ephemeralResponse(helpText);
    }

    private Map<String, Object> ephemeralResponse(String text) {
        return Map.of(
                "response_type", "ephemeral",
                "blocks", List.of(
                        Map.of("type", "section",
                                "text", Map.of("type", "mrkdwn", "text", text))
                )
        );
    }
}
