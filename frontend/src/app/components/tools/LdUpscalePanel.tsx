import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Columns2,
  Download,
  Loader2,
  Server,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { LdCompareModal } from './LdCompareModal';

/**
 * LD 일러 업스케일 — 사내 LAN 전용 목적 고정 엔드포인트를 호출한다.
 *
 * 모델·목표 세로·알파 보존은 전부 서버가 강제하므로 여기서는 PNG 만 올린다.
 * 서버는 돌려주기 전에 종횡비·알파·목표 세로를 검증하고, 어긋나면 실패로 떨군다.
 * 참조 구현: ~/orca/projects/GenerateLD/ld_upscale_server.py
 *
 * 레포에 접근하지 않으므로 캐릭터의 프리팹 scale 은 알 수 없다 — 확대율 대신
 * 결과 높이에서 계산되는 권장 scale(2048 ÷ Image rect 1024)만 보여주고,
 * 적용은 사람이 한다. 소스만 키우고 scale 을 두면 확대율이 1.0 밑으로 떨어져
 * 축소 영역이 되고 mipmap 이 꺼져 있어 오히려 나빠진다.
 */

const HOST_KEY = 'ldUpscale.host';
const DEFAULT_HOST = 'http://192.168.2.73:8790';
const IMAGE_RECT = 1024; // BasePrefab_UI 의 Image rect 세로

type JobStatus = 'wait' | 'run' | 'done' | 'fail' | 'skip';

interface Job {
  id: string;
  name: string;
  file: File;
  srcUrl: string;
  status: JobStatus;
  srcW?: number;
  srcH?: number;
  outW?: number;
  outH?: number;
  resultUrl?: string;
  error?: string;
}

interface Health {
  reachable: boolean;
  comfy: boolean;
  model: boolean;
  targetHeight: number;
  minSourceHeight: number;
  error?: string;
}

function readHost(): string {
  try {
    return localStorage.getItem(HOST_KEY) || DEFAULT_HOST;
  } catch {
    return DEFAULT_HOST;
  }
}

async function readPngSize(file: File): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다'));
      img.src = url;
    });
    return { w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function LdUpscalePanel() {
  const [host, setHost] = useState(readHost);
  const [health, setHealth] = useState<Health | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [hot, setHot] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  const [compareId, setCompareId] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${host.replace(/\/$/, '')}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setHealth({
        reachable: true,
        comfy: !!json.comfy,
        model: !!json.model,
        targetHeight: json.targetHeight ?? 0,
        minSourceHeight: json.minSourceHeight ?? 0,
      });
    } catch (e) {
      setHealth({
        reachable: false,
        comfy: false,
        model: false,
        targetHeight: 0,
        minSourceHeight: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [host]);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // 결과 미리보기용 objectURL 은 컴포넌트가 사라질 때 한 번에 되돌린다
  useEffect(
    () => () => {
      objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  const ready = !!health?.reachable && health.comfy && health.model;
  const targetHeight = health?.targetHeight || 2048;
  const recommendedScale = (targetHeight / IMAGE_RECT).toFixed(2);
  const minSourceHeight = health?.minSourceHeight || 512;

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const added: Job[] = [];
      for (const file of Array.from(files)) {
        // 비교 모달의 BEFORE 로 쓴다 — 결과 URL 과 함께 언마운트 때 되돌린다
        const srcUrl = URL.createObjectURL(file);
        objectUrls.current.push(srcUrl);
        const job: Job = {
          id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          file,
          srcUrl,
          status: 'wait',
        };
        try {
          const { w, h } = await readPngSize(file);
          job.srcW = w;
          job.srcH = h;
          // 서버와 같은 기준으로 미리 거른다 — GPU 를 20~35초 쓰고 같은 답을 받을 이유가 없다
          if (h >= targetHeight) {
            job.status = 'skip';
            job.error = `이미 세로 ${h}px — 임포트가 ${targetHeight}로 깎으므로 올려도 화면이 달라지지 않습니다`;
          } else if (h < minSourceHeight) {
            job.status = 'skip';
            job.error = `세로 ${h}px 는 너무 작습니다 (최소 ${minSourceHeight}) — LD 일러가 맞는지 확인해 주세요`;
          }
        } catch {
          /* 크기를 못 읽어도 서버가 최종 판정한다 */
        }
        added.push(job);
      }
      setJobs((prev) => [...prev, ...added]);
    },
    [targetHeight, minSourceHeight],
  );

  const runAll = useCallback(async () => {
    const base = host.replace(/\/$/, '');
    setRunning(true);
    try {
      // GPU 가 하나라 서버가 요청을 직렬화한다 — 클라이언트도 한 건씩 보낸다
      for (const job of jobs.filter((j) => j.status === 'wait')) {
        setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: 'run' } : j)));
        try {
          const res = await fetch(`${base}/ld/upscale`, {
            method: 'POST',
            headers: { 'Content-Type': 'image/png' },
            body: job.file,
          });
          if (!res.ok) {
            let message = `HTTP ${res.status}`;
            try {
              message = (await res.json()).error ?? message;
            } catch {
              /* 본문이 JSON 이 아니면 상태코드로 둔다 */
            }
            throw new Error(message);
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          objectUrls.current.push(url);
          const outW = Number(res.headers.get('X-Result-Width')) || undefined;
          const outH = Number(res.headers.get('X-Result-Height')) || undefined;
          setJobs((prev) =>
            prev.map((j) =>
              j.id === job.id ? { ...j, status: 'done', resultUrl: url, outW, outH } : j,
            ),
          );
        } catch (e) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === job.id
                ? {
                    ...j,
                    status: 'fail',
                    error: e instanceof Error ? e.message : String(e),
                  }
                : j,
            ),
          );
        }
      }
    } finally {
      setRunning(false);
      checkHealth();
    }
  }, [host, jobs, checkHealth]);

  const downloadDone = useCallback(() => {
    jobs
      .filter((j) => j.status === 'done' && j.resultUrl)
      .forEach((j) => {
        const a = document.createElement('a');
        a.href = j.resultUrl as string;
        a.download = j.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
  }, [jobs]);

  const compareJob = jobs.find((j) => j.id === compareId && j.resultUrl);

  const waiting = jobs.filter((j) => j.status === 'wait').length;
  const doneCount = jobs.filter((j) => j.status === 'done').length;

  const statusChip = (job: Job) => {
    const map: Record<JobStatus, { label: string; cls: string }> = {
      wait: { label: '대기', cls: 'bg-foreground/10 text-slate-400' },
      skip: { label: '건너뜀', cls: 'bg-amber-500/15 text-amber-500' },
      run: { label: '처리 중', cls: 'bg-bridge-accent/15 text-bridge-accent' },
      done: { label: '완료', cls: 'bg-bridge-secondary/15 text-bridge-secondary' },
      fail: { label: '실패', cls: 'bg-red-500/15 text-red-400' },
    };
    const { label, cls } = map[job.status];
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>{label}</span>;
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="flex flex-col gap-3 p-3 md:p-5 max-w-5xl mx-auto">
        {/* 서버 상태 — ComfyUI 가 내려가 있으면 올려도 실패한다 */}
        <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold ${
                ready
                  ? 'bg-bridge-secondary/15 text-bridge-secondary'
                  : 'bg-red-500/15 text-red-400'
              }`}
            >
              <Server size={12} />
              {ready ? '연결됨' : health?.reachable ? '준비 안 됨' : '연결 실패'}
            </span>
            <span className="text-slate-500">
              호스트 <span className="text-foreground tabular-nums">{host}</span>
            </span>
            <span className="text-slate-500">
              목표 세로 <span className="text-foreground tabular-nums">{targetHeight}</span>
            </span>
            {health && !ready && (
              <span className="text-red-400">
                {health.error ?? `comfy=${health.comfy}, model=${health.model}`}
              </span>
            )}
            <button
              onClick={checkHealth}
              className="ml-auto px-2.5 py-1 rounded-lg border border-foreground/[0.08] text-slate-400 hover:text-foreground hover:border-bridge-accent transition-colors"
            >
              다시 확인
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            사내 LAN 전용입니다. 다른 주소를 쓰려면{' '}
            <button
              className="underline hover:text-foreground"
              onClick={() => {
                const next = window.prompt('업스케일 서버 주소', host);
                if (!next) return;
                try {
                  localStorage.setItem(HOST_KEY, next);
                } catch {
                  /* 저장 실패해도 이번 세션에는 적용된다 */
                }
                setHost(next);
              }}
            >
              주소 변경
            </button>
          </p>
        </section>

        {/* 업로드 */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            setHot(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setHot(true);
          }}
          onDragLeave={() => setHot(false)}
          onDrop={(e) => {
            e.preventDefault();
            setHot(false);
            addFiles(e.dataTransfer.files);
          }}
          disabled={!ready}
          className={`rounded-2xl border-[1.5px] border-dashed p-6 text-center transition-colors ${
            hot
              ? 'border-bridge-accent bg-bridge-accent/10'
              : 'border-foreground/[0.12] bg-foreground/[0.02] hover:border-bridge-accent'
          } ${!ready ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <UploadCloud size={22} className="mx-auto mb-2 text-slate-400" />
          <span className="block text-sm font-bold text-foreground">LD 일러 PNG를 끌어다 놓기</span>
          <span className="block text-xs text-slate-500 mt-0.5">
            또는 눌러서 선택 · 여러 장 가능 · 결과는 세로 {targetHeight}로 고정됩니다
          </span>
        </button>
        <input
          ref={inputRef}
          id="ld-upscale-files"
          type="file"
          accept="image/png"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {/* 업스케일만으로는 끝나지 않는다 — 적용 시 프리팹 scale 도 같이 올려야 한다 */}
        <div className="flex gap-2.5 items-start rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-500">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>
            결과를 반영한 뒤 프리팹의 <b>Image scale</b>을{' '}
            <b className="tabular-nums">{recommendedScale}</b>으로 맞춰야 합니다. 소스만 키우고
            scale을 두면 확대율이 1.0 밑으로 떨어져 축소 영역이 되고, mipmap이 꺼져 있어 오히려
            나빠집니다.
          </span>
        </div>

        {/* 큐 */}
        {jobs.length > 0 && (
          <div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
            <div className="hidden md:grid grid-cols-[minmax(140px,1.5fr)_112px_112px_110px_86px] gap-2.5 px-4 py-2.5 bg-bridge-obsidian text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span>파일</span>
              <span>소스</span>
              <span>결과</span>
              <span>권장 scale</span>
              <span>상태</span>
            </div>
            {jobs.map((job) => (
              <div
                key={job.id}
                className="grid grid-cols-2 md:grid-cols-[minmax(140px,1.5fr)_112px_112px_110px_86px] gap-x-2.5 gap-y-1 px-4 py-2.5 bg-bridge-obsidian border-t border-foreground/[0.05] text-xs items-center"
              >
                <span className="col-span-2 md:col-span-1 truncate text-foreground">
                  {job.name}
                </span>
                <span className="tabular-nums text-slate-400">
                  {job.srcW ? `${job.srcW}×${job.srcH}` : '—'}
                </span>
                <span className="tabular-nums text-slate-400">
                  {job.outW ? `${job.outW}×${job.outH}` : '—'}
                </span>
                <span className="tabular-nums text-slate-400">
                  {job.status === 'done' ? recommendedScale : '—'}
                </span>
                <span className="flex items-center gap-1.5">
                  {job.status === 'run' && (
                    <Loader2 size={12} className="animate-spin text-bridge-accent" />
                  )}
                  {statusChip(job)}
                </span>
                {job.error && (
                  <span
                    className={`col-span-2 md:col-span-5 text-[11px] ${
                      job.status === 'skip' ? 'text-amber-500' : 'text-red-400'
                    }`}
                  >
                    {job.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 결과 미리보기 */}
        {jobs.some((j) => j.status === 'done') && (
          <section>
            <h2 className="text-xs font-bold text-foreground mb-2">결과 미리보기</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {jobs
                .filter((j) => j.status === 'done' && j.resultUrl)
                .map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => setCompareId(j.id)}
                    aria-label={`${j.name} 전후 비교 열기`}
                    className="group text-left rounded-xl border border-foreground/[0.08] hover:border-bridge-accent overflow-hidden bg-bridge-obsidian transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                  >
                    <span className="relative block">
                      <img
                        src={j.resultUrl}
                        alt={`${j.name} 업스케일 결과`}
                        className="block w-full h-auto"
                        loading="lazy"
                      />
                      <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                        <Columns2 size={12} />
                        전후 비교
                      </span>
                    </span>
                    <span className="block px-2.5 py-1.5 text-[11px] text-slate-500 truncate border-t border-foreground/[0.08]">
                      {j.name}
                    </span>
                  </button>
                ))}
            </div>
          </section>
        )}

        {/* 액션 */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[11px] text-slate-500 tabular-nums">
            {jobs.length}건 중 {doneCount}건 완료 · 장당 20~35초
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setJobs([])}
            disabled={running || jobs.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-foreground/[0.08] text-xs font-bold text-slate-400 hover:text-foreground hover:border-bridge-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 size={13} />큐 비우기
          </button>
          <button
            onClick={downloadDone}
            disabled={doneCount === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-foreground/[0.08] text-xs font-bold text-slate-400 hover:text-foreground hover:border-bridge-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={13} />
            결과 내려받기
          </button>
          <button
            onClick={runAll}
            disabled={!ready || running || waiting === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bridge-accent text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
          >
            {running && <Loader2 size={13} className="animate-spin" />}
            {waiting}건 업스케일
          </button>
        </div>
      </div>

      {compareJob && (
        <LdCompareModal
          open
          onClose={() => setCompareId(null)}
          name={compareJob.name}
          beforeUrl={compareJob.srcUrl}
          afterUrl={compareJob.resultUrl as string}
          srcW={compareJob.srcW}
          srcH={compareJob.srcH}
          outW={compareJob.outW}
          outH={compareJob.outH}
        />
      )}
    </div>
  );
}
