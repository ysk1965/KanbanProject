import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Loader2,
  AlertCircle,
  Trophy,
  Copy,
  Lock,
  Unlock,
  Users,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { imageVoteAPI } from "../utils/api";
import { formatDateTime } from "../utils/dateUtils";
import { PhotoLightbox } from "../components/organization/photo/PhotoLightbox";
import {
  ImageVoteResultList,
  candidateToPhoto,
  MEDALS,
} from "../components/vote/ImageVoteResultList";
import type { AdminImageVote, OrgPhoto } from "../types";

/**
 * Top3 이미지 투표 결과·관리 페이지 — 인증 불필요 (/vote-results/:adminToken)
 * 투표 링크와 분리된 관리 토큰으로만 접근. 결과 조회 + 투표자별 내역 + 종료/재개.
 */
export function ImageVoteResultsPage() {
  const { adminToken } = useParams<{ adminToken: string }>();
  const [vote, setVote] = useState<AdminImageVote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<OrgPhoto | null>(null);

  const load = useCallback(async () => {
    if (!adminToken) return;
    try {
      const data = await imageVoteAPI.getAdmin(adminToken);
      setVote(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    load();
  }, [load]);

  // 진행 중일 땐 15초마다 새로고침 (별도 투표 페이지에서 들어오는 표 반영)
  useEffect(() => {
    if (!vote || vote.closed) return;
    const id = window.setInterval(load, 15000);
    return () => window.clearInterval(id);
  }, [vote, load]);

  const candidateById = useMemo(() => {
    const m = new Map<string, AdminImageVote["candidates"][number]>();
    vote?.candidates.forEach((c) => m.set(c.id, c));
    return m;
  }, [vote]);

  const voteUrl = vote ? `${window.location.origin}/vote/${vote.token}` : "";
  const resultsUrl = `${window.location.origin}/vote-results/${adminToken}`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}를 복사했습니다`);
    } catch {
      toast.error("복사에 실패했습니다");
    }
  };

  const handleToggleClosed = async () => {
    if (!adminToken || !vote || toggling) return;
    if (!vote.closed && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    setToggling(true);
    try {
      const data = vote.closed
        ? await imageVoteAPI.reopen(adminToken)
        : await imageVoteAPI.close(adminToken);
      setVote(data);
      toast.success(
        data.closed ? "투표를 종료했습니다" : "투표를 다시 열었습니다",
      );
    } catch {
      toast.error("처리에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setToggling(false);
      setConfirmClose(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (error || !vote) {
    return (
      <div className="min-h-screen bg-bridge-dark flex flex-col items-center justify-center gap-3 text-slate-400">
        <AlertCircle className="w-8 h-8" />
        <p className="text-sm">투표 결과를 찾을 수 없습니다</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark">
      {/* Header */}
      <header className="bg-bridge-obsidian border-b border-foreground/[0.08] glass sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-bridge-accent/15 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-4 h-4 text-bridge-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm md:text-lg font-bold text-foreground tracking-tight truncate">
                {vote.title}
              </h1>
              {vote.closed ? (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex-shrink-0">
                  종료됨
                </span>
              ) : (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                  진행 중
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              총 {vote.total_ballots}명 참여
              {vote.closed && vote.closed_at
                ? ` · ${formatDateTime(vote.closed_at)} 종료`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {confirmClose && !vote.closed ? (
              <>
                <span className="hidden sm:inline text-xs text-slate-400">
                  종료하면 더 이상 투표할 수 없어요
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmClose(false)}
                  className="px-3 py-2 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleToggleClosed}
                  disabled={toggling}
                  className="px-3 py-2 bg-rose-500 text-white rounded-xl text-xs font-bold hover:bg-rose-500/90 disabled:opacity-40 transition-all flex items-center gap-1.5"
                >
                  {toggling ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Lock className="w-3.5 h-3.5" />
                  )}
                  종료 확정
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleToggleClosed}
                disabled={toggling}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40 ${
                  vote.closed
                    ? "bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10"
                    : "bg-bridge-accent text-white hover:bg-bridge-accent/90"
                }`}
              >
                {toggling ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : vote.closed ? (
                  <Unlock className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
                {vote.closed ? "다시 열기" : "투표 종료"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 pb-20 space-y-8">
        {/* 링크 */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-4 space-y-3"
        >
          <LinkRow
            label="투표 링크"
            hint="참여자에게 공유"
            url={voteUrl}
            onCopy={() => copy(voteUrl, "투표 링크")}
            openable
          />
          <LinkRow
            label="결과 링크"
            hint="이 페이지 · 종료 권한 포함, 관리자만"
            url={resultsUrl}
            onCopy={() => copy(resultsUrl, "결과 링크")}
          />
        </motion.section>

        {/* 결과 */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
            순위
          </h2>
          {vote.total_ballots === 0 ? (
            <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-8 text-center text-sm text-slate-500">
              아직 참여한 사람이 없어요
            </div>
          ) : (
            <ImageVoteResultList
              candidates={vote.candidates}
              results={vote.results}
              onOpenPhoto={setLightboxPhoto}
            />
          )}
        </section>

        {/* 투표자별 내역 */}
        {vote.ballots.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              투표자 내역
            </h2>
            <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] divide-y divide-foreground/[0.06]">
              {vote.ballots.map((b, i) => {
                const picks = [
                  b.first_candidate_id,
                  b.second_candidate_id,
                  b.third_candidate_id,
                ];
                return (
                  <motion.div
                    key={`${b.voter_name}-${i}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 w-28 sm:w-40 flex-shrink-0">
                      <p className="text-xs md:text-sm font-bold text-foreground truncate">
                        {b.voter_name}
                      </p>
                      {b.voted_at && (
                        <p className="text-xs text-slate-500 truncate">
                          {formatDateTime(b.voted_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto custom-scrollbar">
                      {picks.map((id, rank) => {
                        const c = candidateById.get(id);
                        return (
                          <button
                            key={rank}
                            type="button"
                            onClick={() =>
                              c && setLightboxPhoto(candidateToPhoto(c))
                            }
                            className="flex items-center gap-1.5 flex-shrink-0 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] pr-2 overflow-hidden hover:border-foreground/[0.12] transition-colors"
                            aria-label={`${rank + 1}위 ${c?.label || ""}`}
                          >
                            <span className="w-8 h-10 bg-black flex-shrink-0">
                              {c && (
                                <img
                                  src={c.image_url}
                                  alt={c.label || "candidate"}
                                  className="w-full h-full object-cover"
                                  draggable={false}
                                />
                              )}
                            </span>
                            <span className="text-xs">{MEDALS[rank]}</span>
                            <span className="text-xs text-slate-400 max-w-[80px] truncate">
                              {c?.label || "이름 없음"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <PhotoLightbox
        photo={lightboxPhoto}
        photos={vote.candidates.map(candidateToPhoto)}
        isAdmin={false}
        onClose={() => setLightboxPhoto(null)}
        onNavigate={(p) => setLightboxPhoto(p)}
        onDownload={(p) => window.open(p.url, "_blank", "noopener")}
        onDelete={() => {}}
      />
    </div>
  );
}

function LinkRow({
  label,
  hint,
  url,
  onCopy,
  openable,
}: {
  label: string;
  hint: string;
  url: string;
  onCopy: () => void;
  openable?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="sm:w-28 flex-shrink-0">
        <p className="text-xs font-bold text-foreground">{label}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.target.select()}
        className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
      />
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onCopy}
          className="px-3 py-2.5 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 transition-all flex items-center gap-1"
        >
          <Copy className="w-3.5 h-3.5" />
          복사
        </button>
        {openable && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2.5 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all flex items-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            열기
          </a>
        )}
      </div>
    </div>
  );
}
