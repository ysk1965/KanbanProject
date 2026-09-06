package com.kanban.domain.imagevote.service;

import com.kanban.domain.imagevote.*;
import com.kanban.domain.imagevote.dto.ImageVoteRequest;
import com.kanban.domain.imagevote.dto.ImageVoteResponse;
import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ImageVoteService {

    private final ImageVoteRepository imageVoteRepository;
    private final ImageVoteCandidateRepository candidateRepository;
    private final ImageVoteBallotRepository ballotRepository;
    private final NoteRepository noteRepository;
    private final UserRepository userRepository;

    @Transactional
    public ImageVoteResponse.Created create(String boardId, String noteId, String userId,
                                            ImageVoteRequest.Create request) {
        Note note = noteRepository.findByIdAndBoardId(noteId, boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_NOT_FOUND));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        ImageVote vote = imageVoteRepository.save(ImageVote.builder()
                .note(note)
                .boardId(boardId)
                .title(request.getTitle().trim())
                .createdBy(user)
                .build());

        List<ImageVoteRequest.Candidate> reqCandidates = request.getCandidates();
        for (int i = 0; i < reqCandidates.size(); i++) {
            ImageVoteRequest.Candidate c = reqCandidates.get(i);
            candidateRepository.save(ImageVoteCandidate.builder()
                    .vote(vote)
                    .nodeId(c.getNodeId())
                    .imageUrl(c.getImageUrl())
                    .label(c.getLabel())
                    .position(i)
                    .build());
        }

        return ImageVoteResponse.Created.builder()
                .id(vote.getId())
                .token(vote.getToken())
                .adminToken(vote.getAdminToken())
                .build();
    }

    public ImageVoteResponse.PublicVote getPublicVote(String token, String voterKey) {
        ImageVote vote = imageVoteRepository.findByToken(token)
                .orElseThrow(() -> new BusinessException(ErrorCode.IMAGE_VOTE_NOT_FOUND));

        List<ImageVoteCandidate> candidates = candidateRepository.findByVoteIdOrderByPositionAsc(vote.getId());
        List<ImageVoteBallot> ballots = ballotRepository.findByVoteId(vote.getId());

        ImageVoteResponse.MyBallot myBallot = null;
        if (voterKey != null && !voterKey.isBlank()) {
            myBallot = ballotRepository.findByVoteIdAndVoterKey(vote.getId(), voterKey)
                    .map(b -> ImageVoteResponse.MyBallot.builder()
                            .voterName(b.getVoterName())
                            .firstCandidateId(b.getFirstCandidateId())
                            .secondCandidateId(b.getSecondCandidateId())
                            .thirdCandidateId(b.getThirdCandidateId())
                            .build())
                    .orElse(null);
        }

        return ImageVoteResponse.PublicVote.builder()
                .title(vote.getTitle())
                .closed(vote.isClosed())
                .createdAt(vote.getCreatedAt())
                .candidates(toCandidateDtos(candidates))
                .totalBallots(ballots.size())
                .results(tally(candidates, ballots))
                .myBallot(myBallot)
                .build();
    }

    /** 관리 토큰으로 결과 + 투표자별 내역 조회 */
    public ImageVoteResponse.AdminVote getAdminVote(String adminToken) {
        ImageVote vote = findByAdminToken(adminToken);
        return buildAdminVote(vote);
    }

    /** 투표 종료 — 이후 ballot 제출 불가, 공개 페이지는 결과만 표시 */
    @Transactional
    public ImageVoteResponse.AdminVote close(String adminToken) {
        ImageVote vote = findByAdminToken(adminToken);
        vote.close();
        return buildAdminVote(vote);
    }

    /** 종료된 투표 다시 열기 */
    @Transactional
    public ImageVoteResponse.AdminVote reopen(String adminToken) {
        ImageVote vote = findByAdminToken(adminToken);
        vote.reopen();
        return buildAdminVote(vote);
    }

    private ImageVote findByAdminToken(String adminToken) {
        return imageVoteRepository.findByAdminToken(adminToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.IMAGE_VOTE_NOT_FOUND));
    }

    private ImageVoteResponse.AdminVote buildAdminVote(ImageVote vote) {
        List<ImageVoteCandidate> candidates = candidateRepository.findByVoteIdOrderByPositionAsc(vote.getId());
        List<ImageVoteBallot> ballots = ballotRepository.findByVoteId(vote.getId());

        List<ImageVoteResponse.BallotDetail> ballotDetails = ballots.stream()
                .sorted(Comparator.comparing(
                        (ImageVoteBallot b) -> b.getUpdatedAt() != null ? b.getUpdatedAt() : b.getCreatedAt(),
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(b -> ImageVoteResponse.BallotDetail.builder()
                        .voterName(b.getVoterName())
                        .firstCandidateId(b.getFirstCandidateId())
                        .secondCandidateId(b.getSecondCandidateId())
                        .thirdCandidateId(b.getThirdCandidateId())
                        .votedAt(b.getUpdatedAt() != null ? b.getUpdatedAt() : b.getCreatedAt())
                        .build())
                .toList();

        return ImageVoteResponse.AdminVote.builder()
                .title(vote.getTitle())
                .closed(vote.isClosed())
                .createdAt(vote.getCreatedAt())
                .closedAt(vote.getClosedAt())
                .token(vote.getToken())
                .candidates(toCandidateDtos(candidates))
                .totalBallots(ballots.size())
                .results(tally(candidates, ballots))
                .ballots(ballotDetails)
                .build();
    }

    private List<ImageVoteResponse.Candidate> toCandidateDtos(List<ImageVoteCandidate> candidates) {
        return candidates.stream()
                .map(c -> ImageVoteResponse.Candidate.builder()
                        .id(c.getId())
                        .imageUrl(c.getImageUrl())
                        .label(c.getLabel())
                        .build())
                .toList();
    }

    /** 후보별 집계 — 1위 3점 · 2위 2점 · 3위 1점, 점수 내림차순 */
    private List<ImageVoteResponse.CandidateResult> tally(List<ImageVoteCandidate> candidates,
                                                          List<ImageVoteBallot> ballots) {
        Map<String, int[]> tally = new HashMap<>(); // candidateId → [first, second, third]
        for (ImageVoteBallot b : ballots) {
            tally.computeIfAbsent(b.getFirstCandidateId(), k -> new int[3])[0]++;
            tally.computeIfAbsent(b.getSecondCandidateId(), k -> new int[3])[1]++;
            tally.computeIfAbsent(b.getThirdCandidateId(), k -> new int[3])[2]++;
        }

        return candidates.stream()
                .map(c -> {
                    int[] cnt = tally.getOrDefault(c.getId(), new int[3]);
                    return ImageVoteResponse.CandidateResult.builder()
                            .candidateId(c.getId())
                            .firstCount(cnt[0])
                            .secondCount(cnt[1])
                            .thirdCount(cnt[2])
                            .points(cnt[0] * 3 + cnt[1] * 2 + cnt[2])
                            .build();
                })
                .sorted((a, b) -> Integer.compare(b.getPoints(), a.getPoints()))
                .toList();
    }

    @Transactional
    public void submitBallot(String token, ImageVoteRequest.Ballot request) {
        ImageVote vote = imageVoteRepository.findByToken(token)
                .orElseThrow(() -> new BusinessException(ErrorCode.IMAGE_VOTE_NOT_FOUND));
        if (vote.isClosed()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "종료된 투표입니다");
        }

        String first = request.getFirstCandidateId();
        String second = request.getSecondCandidateId();
        String third = request.getThirdCandidateId();

        Set<String> picks = new HashSet<>(List.of(first, second, third));
        if (picks.size() != 3) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "1·2·3위는 서로 달라야 합니다");
        }
        Set<String> candidateIds = new HashSet<>(
                candidateRepository.findByVoteIdOrderByPositionAsc(vote.getId()).stream()
                        .map(ImageVoteCandidate::getId)
                        .toList());
        if (!candidateIds.containsAll(picks)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "잘못된 후보입니다");
        }

        String voterName = request.getVoterName().trim();
        ballotRepository.findByVoteIdAndVoterKey(vote.getId(), request.getVoterKey())
                .ifPresentOrElse(
                        existing -> existing.updatePicks(voterName, first, second, third),
                        () -> ballotRepository.save(ImageVoteBallot.builder()
                                .vote(vote)
                                .voterName(voterName)
                                .voterKey(request.getVoterKey())
                                .firstCandidateId(first)
                                .secondCandidateId(second)
                                .thirdCandidateId(third)
                                .build()));
    }
}
