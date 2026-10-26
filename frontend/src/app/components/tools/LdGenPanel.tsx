import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, Loader2, Play, Server, Upload } from 'lucide-react';

/**
 * LD 생성(M4) 패널 — 사내 LAN 전용 엔드포인트를 통해 생성 플로우를 진행한다.
 *
 * 그림을 만드는 단계는 외부 LLM 수동 작업이라 자동화하지 않는다. 이 화면의 가치는
 * 자동화가 아니라 **왕복 관리**다 — 지금은 아트가 터미널에서 프롬프트를 뽑아 붙여넣고
 * 받은 그림을 정해진 파일명으로 폴더에 넣는데, 파일명이나 순서를 틀리면 조용히 깨진다.
 * 여기서는 단계를 순서대로 안내하고 업로드 파일명을 서버가 정한다.
 *
 * 계약: ~/orca/projects/GenerateLD/ld_gen.py
 */

const HOST_KEY = 'ldUpscale.host';
const DEFAULT_HOST = 'http://192.168.2.73:8790';

interface Step {
  key: string;
  label: string;
  kind: 'llm' | 'local';
  done: boolean;
  ready: boolean;
  requires: string[];
  produces: string[];
}

interface SlugState {
  slug: string;
  exists: boolean;
  name: string;
  tier: string;
  decoCount?: number;
  steps: Step[];
  next: string | null;
  artifacts: Record<string, number>;
}

interface SlugRow {
  slug: string;
  name: string;
  tier: string;
  inSpec: boolean;
}

interface Attachment {
  index: number;
  name: string;
  exists: boolean;
}

interface PromptPayload {
  stage: string;
  prompt: string;
  attachments: Attachment[];
}

function readHost(): string {
  try {
    return localStorage.getItem(HOST_KEY) || DEFAULT_HOST;
  } catch {
    return DEFAULT_HOST;
  }
}

/** LLM 단계가 돌려줄 산출물 이름 — 업로드할 때 서버가 이 이름으로 받는다. */
function uploadNameFor(step: Step, passNo: number): string {
  if (step.key === 'attach') return `attach_p${passNo}_raw.png`;
  return step.produces[0];
}

export function LdGenPanel() {
  const host = useMemo(() => readHost().replace(/\/$/, ''), []);
  const [slugs, setSlugs] = useState<SlugRow[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [state, setState] = useState<SlugState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptPayload | null>(null);
  const [passNo, setPassNo] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(`${host}${path}`, init);
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          message = (await res.json()).error ?? message;
        } catch {
          /* JSON 이 아니면 상태코드로 둔다 */
        }
        throw new Error(message);
      }
      return res;
    },
    [host],
  );

  const loadSlugs = useCallback(async () => {
    try {
      const json = await (await call('/ld/gen')).json();
      setSlugs(json.slugs ?? []);
      setReachable(true);
    } catch (e) {
      setReachable(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [call]);

  const loadState = useCallback(
    async (slug: string) => {
      try {
        setState(await (await call(`/ld/gen/${slug}`)).json());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [call],
  );

  useEffect(() => {
    loadSlugs();
  }, [loadSlugs]);

  useEffect(() => {
    if (active) loadState(active);
  }, [active, loadState]);

  // 단계를 고르지 않았으면 서버가 계산한 "다음 할 일"을 연다
  const step = useMemo(() => {
    if (!state) return null;
    const key = selected ?? state.next;
    return state.steps.find((s) => s.key === key) ?? null;
  }, [state, selected]);

  useEffect(() => {
    setPrompt(null);
    setCopied(false);
    if (!active || !step || step.kind !== 'llm') return;
    let alive = true;
    call(`/ld/gen/${active}/prompt/${step.key}`, { headers: { 'X-Pass': String(passNo) } })
      .then((r) => r.json())
      .then((json) => {
        if (alive) setPrompt(json);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [active, step, passNo, call]);

  const runStage = useCallback(async () => {
    if (!active || !step) return;
    setBusy(step.key);
    setError('');
    try {
      const res = await call(`/ld/gen/${active}/run/${step.key}`, {
        method: 'POST',
        headers: { 'X-Pass': String(passNo) },
      });
      const json = await res.json();
      setState(json.state);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [active, step, passNo, call]);

  const upload = useCallback(
    async (file: File) => {
      if (!active || !step) return;
      const name = uploadNameFor(step, passNo);
      setBusy(step.key);
      setError('');
      try {
        const res = await call(`/ld/gen/${active}/file/${name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/png' },
          body: file,
        });
        setState(await res.json());
        setSelected(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [active, step, passNo, call],
  );

  const copyPrompt = useCallback(async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('클립보드에 쓸 수 없습니다 — 프롬프트를 직접 선택해 복사해 주세요');
    }
  }, [prompt]);

  const doneCount = state?.steps.filter((s) => s.done).length ?? 0;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="flex flex-col gap-3 p-3 md:p-5 max-w-5xl mx-auto">
        {/* 서버 상태 */}
        <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold ${
              reachable
                ? 'bg-bridge-secondary/15 text-bridge-secondary'
                : 'bg-red-500/15 text-red-400'
            }`}
          >
            <Server size={12} />
            {reachable === null ? '확인 중' : reachable ? '연결됨' : '연결 실패'}
          </span>
          <span className="text-slate-500">
            호스트 <span className="text-foreground">{host}</span>
          </span>
          <span className="text-slate-500">캐릭터 {slugs.length}종</span>
          <button
            onClick={loadSlugs}
            className="ml-auto px-2.5 py-1 rounded-lg border border-foreground/[0.08] text-slate-400 hover:text-foreground hover:border-bridge-accent transition-colors"
          >
            새로고침
          </button>
        </section>

        {/* 캐릭터 목록 */}
        <div className="flex gap-1 p-1 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08] overflow-x-auto custom-scrollbar">
          {slugs.map((s) => (
            <button
              key={s.slug}
              onClick={() => {
                setActive(s.slug);
                setSelected(null);
                setError('');
              }}
              className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                active === s.slug
                  ? 'bg-bridge-obsidian text-foreground shadow'
                  : 'text-slate-400 hover:text-foreground'
              }`}
            >
              {s.name || s.slug}
              {!s.inSpec && <span className="ml-1 text-amber-500">·스펙없음</span>}
            </button>
          ))}
        </div>

        {!active && (
          <p className="text-xs text-slate-500 px-1">
            캐릭터를 고르면 현재 단계와 다음에 할 일을 보여줍니다.
          </p>
        )}

        {state && (
          <>
            {/* 스테퍼 */}
            <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1">
              {state.steps.map((s) => {
                const isOpen = step?.key === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSelected(s.key)}
                    className={`shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl border text-center min-w-[88px] transition-colors ${
                      isOpen
                        ? 'border-bridge-accent bg-bridge-obsidian'
                        : s.done
                          ? 'border-bridge-secondary/40 bg-bridge-obsidian'
                          : 'border-foreground/[0.08] bg-bridge-obsidian/60'
                    }`}
                  >
                    <span className="text-[11.5px] font-bold text-foreground flex items-center gap-1">
                      {s.done && <Check size={11} className="text-bridge-secondary" />}
                      {s.label}
                    </span>
                    <span
                      className={`text-[9.5px] ${
                        s.kind === 'llm' ? 'text-purple-400' : 'text-bridge-secondary'
                      }`}
                    >
                      {s.kind === 'llm' ? 'LLM 수동' : '자동'}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-500 px-1 tabular-nums">
              {state.name || state.slug} · {doneCount}/{state.steps.length} 단계 완료
              {state.decoCount ? ` · 장식 ${state.decoCount}개` : ''}
            </p>

            {error && (
              <div className="flex gap-2.5 items-start rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* 단계 패널 */}
            {step && (
              <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-foreground">
                    {step.label}
                    <span className="ml-2 text-[11px] font-normal text-slate-500">
                      {step.produces.join(', ')}
                    </span>
                  </h3>
                  {step.done && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-bridge-secondary/15 text-bridge-secondary">
                      완료
                    </span>
                  )}
                  {step.key === 'attach' && (
                    <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500">
                      패스
                      <input
                        id="ld-gen-pass"
                        type="number"
                        min={1}
                        max={9}
                        value={passNo}
                        onChange={(e) => setPassNo(Math.max(1, Number(e.target.value) || 1))}
                        className="w-12 bg-foreground/5 border border-foreground/[0.08] rounded px-1.5 py-0.5 text-foreground tabular-nums"
                      />
                    </label>
                  )}
                </div>

                {!step.ready && (
                  <p className="text-xs text-amber-500">
                    앞 단계 산출물이 없습니다 — {step.requires.join(', ')}
                  </p>
                )}

                {step.kind === 'llm' ? (
                  <>
                    {prompt && (
                      <>
                        <pre className="text-[11px] leading-relaxed text-slate-400 bg-foreground/[0.03] border border-foreground/[0.05] rounded-xl p-3 max-h-56 overflow-auto whitespace-pre-wrap">
                          {prompt.prompt}
                        </pre>
                        {prompt.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {prompt.attachments.map((a) => (
                              <a
                                key={a.index}
                                href={`${host}/ld/gen/${active}/attach/${step.key}/${a.index}`}
                                target="_blank"
                                rel="noreferrer"
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] ${
                                  a.exists
                                    ? 'border-foreground/[0.08] text-slate-400 hover:text-foreground hover:border-bridge-accent'
                                    : 'border-amber-500/30 text-amber-500 pointer-events-none'
                                }`}
                              >
                                <Download size={11} />
                                {a.name}
                                {!a.exists && ' (없음)'}
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex gap-2 flex-wrap items-center">
                      <button
                        onClick={copyPrompt}
                        disabled={!prompt}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-bridge-accent text-white text-xs font-bold disabled:opacity-40 hover:brightness-110 transition-all"
                      >
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                        {copied ? '복사했습니다' : '프롬프트 복사'}
                      </button>
                      <button
                        onClick={() => fileRef.current?.click()}
                        disabled={busy === step.key}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-foreground/[0.08] text-xs font-bold text-slate-400 hover:text-foreground hover:border-bridge-accent disabled:opacity-40 transition-colors"
                      >
                        {busy === step.key ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Upload size={13} />
                        )}
                        결과 업로드 → {uploadNameFor(step, passNo)}
                      </button>
                    </div>
                    <input
                      ref={fileRef}
                      id="ld-gen-upload"
                      type="file"
                      accept="image/png"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload(f);
                        e.target.value = '';
                      }}
                    />
                  </>
                ) : (
                  <div className="flex gap-2 flex-wrap items-center">
                    <span className="text-[11px] text-slate-500">
                      서버에서 실행합니다 · {step.requires.join(', ')} → {step.produces.join(', ')}
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={runStage}
                      disabled={!step.ready || busy === step.key}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bridge-accent text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
                    >
                      {busy === step.key ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Play size={13} />
                      )}
                      실행
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* 산출물 */}
            {Object.keys(state.artifacts).length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-foreground mb-2">산출물</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  {Object.keys(state.artifacts).map((name) => (
                    <figure
                      key={name}
                      className="m-0 rounded-xl border border-foreground/[0.08] overflow-hidden bg-bridge-obsidian"
                    >
                      <img
                        src={`${host}/ld/gen/${active}/file/${name}`}
                        alt={name}
                        loading="lazy"
                        className="block w-full h-auto"
                      />
                      <figcaption className="px-2.5 py-1.5 text-[11px] text-slate-500 truncate border-t border-foreground/[0.08]">
                        {name}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
