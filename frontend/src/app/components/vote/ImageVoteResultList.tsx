import { motion } from "framer-motion";
import type {
  PublicImageVoteCandidate,
  PublicImageVoteResult,
  OrgPhoto,
} from "../../types";

export const MEDALS = ["🥇", "🥈", "🥉"];

/** 투표 후보 → PhotoLightbox 재사용을 위한 OrgPhoto 매핑 */
export function candidateToPhoto(c: PublicImageVoteCandidate): OrgPhoto {
  return {
    id: c.id,
    tab_id: "",
    s3_key: "",
    thumbnail_key: null,
    url: c.image_url,
    thumbnail_url: null,
    original_filename: c.label || "image",
    file_size: 0,
    content_type: "image/*",
    width: null,
    height: null,
    caption: c.label,
    uploaded_by: { id: "", name: "", email: "", profile_image_url: null },
    created_at: "",
  };
}

interface Props {
  candidates: PublicImageVoteCandidate[];
  results: PublicImageVoteResult[];
  onOpenPhoto: (photo: OrgPhoto) => void;
}

/** 순위별 점수 바 리스트 — 투표 페이지·결과 페이지 공용 */
export function ImageVoteResultList({
  candidates,
  results,
  onOpenPhoto,
}: Props) {
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const maxPoints = Math.max(1, ...results.map((r) => r.points));

  return (
    <div className="space-y-3">
      {results.map((r, i) => {
        const c = candidateById.get(r.candidate_id);
        if (!c) return null;
        return (
          <motion.div
            key={r.candidate_id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center gap-3.5 bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-3.5"
          >
            <span className="w-9 text-center text-lg flex-shrink-0">
              {i < 3 ? MEDALS[i] : ""}
              {i >= 3 && (
                <span className="text-xs font-bold text-slate-500">
                  {i + 1}위
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => onOpenPhoto(candidateToPhoto(c))}
              className="w-14 h-[72px] rounded-lg overflow-hidden bg-black flex-shrink-0 border border-foreground/10 cursor-zoom-in"
              aria-label={c.label || "이미지 크게 보기"}
            >
              <img
                src={c.image_url}
                alt={c.label || "candidate"}
                className="w-full h-full object-contain"
                draggable={false}
              />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs md:text-sm font-bold text-foreground truncate">
                {c.label || "이름 없음"}
              </p>
              <div className="mt-1.5 h-2 rounded-full bg-foreground/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-bridge-accent to-bridge-secondary transition-all"
                  style={{ width: `${(r.points / maxPoints) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                🥇{r.first_count} · 🥈{r.second_count} · 🥉{r.third_count}
              </p>
            </div>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent flex-shrink-0">
              {r.points}점
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
