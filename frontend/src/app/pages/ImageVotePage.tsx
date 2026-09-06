import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, AlertCircle, Trophy, Check, RotateCcw, Lock } from "lucide-react";
import { imageVoteAPI } from "../utils/api";
import { PhotoLightbox } from "../components/organization/photo/PhotoLightbox";
import {
  ImageVoteResultList,
  candidateToPhoto,
} from "../components/vote/ImageVoteResultList";
import type { PublicImageVote, OrgPhoto } from "../types";

const VOTER_KEY_STORAGE = "bridge-image-vote-key";

function getVoterKey(): string {
  let key = localStorage.getItem(VOTER_KEY_STORAGE);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(VOTER_KEY_STORAGE, key);
  }
  return key;
}

const RANK_LABELS = ["1위", "2위", "3위"];

/** 공개 Top3 이미지 투표 페이지 — 인증 불필요 (/vote/:token) */
export function ImageVotePage() {
  const { token } = useParams<{ token: string }>();
  const [vote, setVote] = useState<PublicImageVote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [picks, setPicks] = useState<string[]>([]); // candidate id, index = rank-1
  const [voterName, setVoterName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<"vote" | "results">("vote");
  const [lightboxPhoto, setLightboxPhoto] = useState<OrgPhoto | null>(null);

  const voterKey = useMemo(() => getVoterKey(), []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await imageVoteAPI.getPublic(token, voterKey);
      setVote(data);
      if (data.closed) {
        setView("results");
      }
      if (data.my_ballot) {
        setVoterName(data.my_ballot.voter_name);
        setPicks([
          data.my_ballot.first_candidate_id,
          data.my_ballot.second_candidate_id,
          data.my_ballot.third_candidate_id,
        ]);
        setView("results");
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token, voterKey]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePick = (candidateId: string) => {
    setPicks((prev) => {
      if (prev.includes(candidateId)) {
        return prev.filter((id) => id !== candidateId);
      }
      if (prev.length >= 3) return prev;
      return [...prev, candidateId];
    });
  };

  const canSubmit = picks.length === 3 && voterName.trim().length > 0;

  const handleSubmit = async () => {
    if (!token || !canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await imageVoteAPI.submitBallot(token, {
        voter_name: voterName.trim(),
        voter_key: voterKey,
        first_candidate_id: picks[0],
        second_candidate_id: picks[1],
        third_candidate_id: picks[2],
      });
      const data = await imageVoteAPI.getPublic(token, voterKey);
      setVote(data);
      setView("results");
    } catch {
      alert("투표 제출에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
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
        <p className="text-sm">투표를 찾을 수 없습니다</p>
      </div>
    );
  }

  const showVoteForm = view === "vote" && !vote.closed;

  return (
    <div className="min-h-screen bg-bridge-dark">
      {/* Header */}
      <header className="bg-bridge-obsidian border-b border-foreground/[0.08] glass sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-bridge-accent/15 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-4 h-4 text-bridge-accent" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm md:text-lg font-bold text-foreground tracking-tight truncate">
              {vote.title}
            </h1>
            <p className="text-xs text-slate-500">
              {showVoteForm
                ? "마음에 드는 이미지를 순서대로 3개 골라주세요 (1위 → 3위)"
                : `총 ${vote.total_ballots}명 참여`}
            </p>
          </div>
          {vote.closed && (
            <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex-shrink-0 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              종료됨
            </span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 pb-40">
        {showVoteForm ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {vote.candidates.map((c, i) => {
                const rank = picks.indexOf(c.id);
                const picked = rank >= 0;
                return (
                  <motion.button
                    key={c.id}
                    type="button"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => togglePick(c.id)}
                    className={`relative rounded-2xl overflow-hidden border-2 transition-all text-left ${
                      picked
                        ? "border-bridge-accent shadow-[0_0_30px_rgba(99,102,241,0.3)]"
                        : "border-foreground/[0.08] hover:border-foreground/[0.12]"
                    }`}
                  >
                    <div className="aspect-[3/4] bg-black">
                      <img
                        src={c.image_url}
                        alt={c.label || "candidate"}
                        className="w-full h-full object-contain"
                        loading="lazy"
                        draggable={false}
                      />
                    </div>
                    {c.label && (
                      <div className="px-2 py-1.5 bg-bridge-obsidian">
                        <p className="text-xs text-slate-400 truncate text-center">
                          {c.label}
                        </p>
                      </div>
                    )}
                    {picked && (
                      <div className="absolute top-2 left-2 w-8 h-8 rounded-full bg-bridge-accent text-white text-xs font-bold flex items-center justify-center shadow-lg">
                        {RANK_LABELS[rank]}
                      </div>
                    )}
                    <span
                      className="absolute bottom-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-dark/70 text-slate-400 cursor-zoom-in"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxPhoto(candidateToPhoto(c));
                      }}
                    >
                      크게 보기
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {/* 하단 제출 바 */}
            <div className="fixed bottom-0 left-0 right-0 z-20 bg-bridge-obsidian/95 backdrop-blur-md border-t border-foreground/[0.08]">
              <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {[0, 1, 2].map((r) => {
                    const c = picks[r] ? candidateById.get(picks[r]) : null;
                    return (
                      <div
                        key={r}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-bold ${
                          c
                            ? "border-bridge-accent/40 bg-bridge-accent/15 text-bridge-accent"
                            : "border-foreground/10 bg-foreground/[0.03] text-slate-600"
                        }`}
                      >
                        <span>{MEDALS[r]}</span>
                        <span className="max-w-[72px] truncate">
                          {c ? c.label || `${r + 1}위 선택됨` : "미선택"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <input
                  value={voterName}
                  onChange={(e) => setVoterName(e.target.value)}
                  placeholder="이름을 입력하세요"
                  maxLength={100}
                  className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-4 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className="px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold text-sm hover:bg-bridge-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  투표 제출
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 결과 뷰 */}
            {vote.closed && (
              <p className="mb-4 text-xs text-slate-500 text-center">
                투표가 종료되어 결과만 볼 수 있어요
              </p>
            )}
            <ImageVoteResultList
              candidates={vote.candidates}
              results={vote.results}
              onOpenPhoto={setLightboxPhoto}
            />

            {!vote.closed && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setView("vote")}
                className="px-5 py-2.5 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-sm font-medium hover:bg-foreground/10 transition-all flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                다시 투표하기
              </button>
            </div>
            )}
          </>
        )}
      </main>

      {/* 라이트박스 — 자체 줌/팬 지원 (브라우저 확대 불필요) */}
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
