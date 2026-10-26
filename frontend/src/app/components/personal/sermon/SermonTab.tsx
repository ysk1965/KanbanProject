import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Loader2, LogIn, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { UserMenu } from '../../UserMenu';
import { ANONYMOUS_USER, SermonStore } from './sermonStore';
import { kickVersionUploads } from './sermonVersions';
import { SermonList } from './SermonList';
import { SermonEditor } from './SermonEditor';
import { applyStyle, loadStyle, persistStyle, type SermonStyle } from './sermonStyle';
import { applyInk, type MascotId, type SermonLook } from './sermonLook';
import { Mascot } from './Mascot';
import { LookModal } from './LookModal';
import { esc, newNote, toggleApplyDone, type SermonNote } from './sermonTypes';
import { clearStart, readStart } from './share/shareModel';
import { FirstSticker } from './share/FirstSticker';
import { GroupContext } from './group/GroupContext';
import { useGroupWiring } from './group/useGroupWiring';
import { loadBible } from './useBible';
import { useSermonProfile } from './profile/useSermonProfile';
import { ProfileContext } from './profile/ProfileContext';
import { installTapFx } from './microFx';
import './sermon.css';

/**
 * 설교 노트 루트. 두 곳에서 쓴다.
 *  - 마이 스페이스 탭: ?tab=sermon&note=<id> (항상 로그인 상태)
 *  - 독립 화면 /sermonnote: 로그인 없이도 기기 저장으로 쓰고, 상단 띠의 「로그인」으로 기존 로그인에 들어오면
 *    그 사용자의 노트로 동기화된다. 로그인 전 노트는 로그인 직후 그 계정으로 옮겨진다.
 */

interface SermonTabProps {
  /** /sermonnote 독립 화면 — 상단 띠(브랜드·로그인/사용자 메뉴)를 그리고 tab 파라미터를 쓰지 않는다 */
  standalone?: boolean;
}

const PARAM_TAB = 'tab';
const PARAM_NOTE = 'note';
const FONT_ID = 'sermon-hahmlet-font';
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Hahmlet:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;700;800;900&family=Black+Han+Sans&family=Gaegu:wght@400;700&display=swap';

/* ───── 홈 화면 설치 안내 (독립 화면에서만) ───── */
const INSTALL_HINT_KEY = 'sermon-install-hint-dismissed';
const VISITS_KEY = 'sermon-visits';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** 안드로이드 크롬: beforeinstallprompt 를 받아 두었다가 버튼으로 띄운다. iOS: 두 번째 방문부터 안내 한 줄 */
function useInstallHint(enabled: boolean) {
  const [promptEvt, setPromptEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (!enabled || isStandaloneDisplay()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    try {
      const visits = Number(localStorage.getItem(VISITS_KEY) || 0) + 1;
      localStorage.setItem(VISITS_KEY, String(visits));
      if (isIOS() && visits >= 2 && !localStorage.getItem(INSTALL_HINT_KEY)) setIosHint(true);
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [enabled]);

  const install = useCallback(async () => {
    if (!promptEvt) return;
    await promptEvt.prompt();
    setPromptEvt(null);
  }, [promptEvt]);
  const dismissIos = useCallback(() => {
    setIosHint(false);
    try {
      localStorage.setItem(INSTALL_HINT_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);
  return { canInstall: !!promptEvt, install, iosHint, dismissIos };
}

function ensureFont() {
  if (document.getElementById(FONT_ID)) return;
  const link = document.createElement('link');
  link.id = FONT_ID;
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  document.head.appendChild(link);
}

export default function SermonTab({ standalone = false }: SermonTabProps) {
  const { currentUser, isAuthenticated, isLoading: authLoading, logout, hideBilling } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // 인증 확인이 끝나기 전에는 저장소를 만들지 않는다 (익명 → 사용자로 두 번 띄우지 않기 위해)
  const authReady = !authLoading;
  const userId = isAuthenticated && currentUser?.id ? currentUser.id : ANONYMOUS_USER;
  useEffect(installTapFx, []);
  const anonymous = userId === ANONYMOUS_USER;

  const { canInstall, install, iosHint, dismissIos } = useInstallHint(standalone);

  const goLogin = useCallback(() => {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    navigate(`/login?returnTo=${returnTo}`);
  }, [navigate, location.pathname, location.search]);

  if (!authReady) {
    return (
      <div className="sermon-app">
        <div
          style={{ flex: 1, display: 'grid', placeItems: 'center' }}
          role="status"
          aria-label="불러오는 중"
        >
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--sn-accent)' }} />
        </div>
      </div>
    );
  }

  return (
    <SermonTabBody
      key={userId}
      userId={userId}
      anonymous={anonymous}
      standalone={standalone}
      onLogin={anonymous ? goLogin : undefined}
      strip={(mascot) =>
        standalone ? (
          <>
            <header className="sn-strip">
              <div className="sn-brand">
                <Mascot kind={mascot} size={28} />
                갈피
              </div>
              <span className="sn-sp" />
              {canInstall && (
                <button
                  type="button"
                  className="sn-btn sn-ghost"
                  onClick={() => void install()}
                  title="홈 화면에 설치"
                >
                  <Download className="sn-icon" aria-hidden />
                  설치
                </button>
              )}
              {anonymous ? (
                <>
                  <span className="sn-strip-hint">로그인 없이도 이 기기에 저장돼요</span>
                  <button type="button" className="sn-btn sn-primary" onClick={goLogin}>
                    <LogIn className="sn-icon" aria-hidden />
                    로그인
                  </button>
                </>
              ) : (
                currentUser && (
                  <UserMenu
                    user={{ ...currentUser, avatar: currentUser.profile_image || undefined }}
                    onOpenSubscription={() => navigate('/boards')}
                    onLogout={() => void logout()}
                    hideBilling={hideBilling}
                  />
                )
              )}
            </header>
            {iosHint && (
              <div className="sn-install" role="status">
                <div className="sn-install-text">
                  <b>홈 화면에 추가하면 앱처럼 열려요.</b> Safari 아래 공유 버튼 → 「홈 화면에
                  추가」
                </div>
                <button
                  type="button"
                  className="sn-x"
                  aria-label="다시 보지 않기"
                  onClick={dismissIos}
                >
                  <X className="sn-icon" style={{ width: 16, height: 16 }} />
                </button>
              </div>
            )}
          </>
        ) : null
      }
    />
  );
}

interface BodyProps {
  userId: string;
  anonymous: boolean;
  standalone: boolean;
  onLogin?: () => void;
  /** 상단 띠. 마스코트는 꾸미기 설정(look)을 따르므로 본문에서 받아 그린다 */
  strip: (mascot: MascotId) => React.ReactNode;
}

const BACK_LABEL: Record<string, string> = {
  groups: '모임',
  bible: '성경',
  challenge: '챌린지',
  me: '나의 갈피',
};

function SermonTabBody({ userId, anonymous, standalone, onLogin, strip }: BodyProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();
  const userName = anonymous ? undefined : currentUser?.name ? String(currentUser.name) : undefined;

  const store = useMemo(() => new SermonStore(userId), [userId]);
  const [, setTick] = useState(0);
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get(PARAM_NOTE));
  const [openAid, setOpenAid] = useState<string | null>(null);
  const [style, setStyle] = useState<SermonStyle>(() => loadStyle());
  const [lookOpen, setLookOpen] = useState(false);
  // 꾸미기(잉크·캐릭터)는 이름표에 들어 있다 — 서버에 보관되고 기기 키(sermon-look-v1)에도 같이 적힌다
  const profile = useSermonProfile({ userId, anonymous, store });
  const look: SermonLook = useMemo(
    () => ({ ink: profile.data.ink, mascot: profile.data.mascot }),
    [profile.data.ink, profile.data.mascot],
  );

  // 저장소 기동 + 폰트 + 성경 데이터
  useEffect(() => {
    ensureFont();
    void loadBible().then((d) => {
      if (!d) toast('성경 본문을 불러오지 못했어요. 구절 주소는 그대로 쓸 수 있어요');
    });
    const unsub = store.subscribe(() => setTick((t) => t + 1));
    void store.init();
    return () => {
      unsub();
      store.dispose();
    };
  }, [store]);

  // 지난번에 서버로 못 올린 버전 기록이 있으면 올린다 (익명은 안 함)
  useEffect(() => {
    kickVersionUploads(userId);
  }, [userId]);

  // 서식 설정 → CSS 변수
  useEffect(() => {
    applyStyle(rootRef.current, style);
  }, [style]);
  const onStyleChange = useCallback((s: SermonStyle) => {
    setStyle(s);
    persistStyle(s);
  }, []);

  // 꾸미기 → html[data-sn-ink] (포털 오버레이까지 같은 색)
  useEffect(() => applyInk(look.ink), [look.ink]);
  const { update: updateProfile } = profile;
  const onLookChange = useCallback(
    (l: SermonLook) => updateProfile({ ink: l.ink, mascot: l.mascot }),
    [updateProfile],
  );

  // URL 동기화 (마이 스페이스에서는 tab=sermon 도 같이 적는다)
  // 노트를 여는 순간만 방문 기록에 쌓아, 시스템 뒤로(안드로이드 버튼·스와이프)가 목록으로 돌아오게 한다
  const prevOpen = useRef(openId);
  const pushedNote = useRef(false);
  useEffect(() => {
    const opening = !prevOpen.current && !!openId;
    prevOpen.current = openId;
    const next = new URLSearchParams(searchParams);
    if (!standalone) next.set(PARAM_TAB, 'sermon');
    if (openId) next.set(PARAM_NOTE, openId);
    else next.delete(PARAM_NOTE);
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: !opening });
    if (opening) pushedNote.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, standalone]);
  // 뒤로·앞으로 가기로 주소가 바뀌면 열린 노트도 따라간다
  const urlNote = searchParams.get(PARAM_NOTE);
  useEffect(() => {
    if (!urlNote) pushedNote.current = false;
    prevOpen.current = urlNote;
    setOpenId(urlNote);
  }, [urlNote]);
  /** 닫기 — 여기서 쌓은 기록이면 한 칸 뒤로, 딥링크로 바로 들어왔으면 목록으로 바꿔치기 */
  const closeNote = useCallback(() => {
    if (pushedNote.current) {
      pushedNote.current = false;
      navigate(-1);
    } else setOpenId(null);
  }, [navigate]);

  // 다른 기기 수정과 겹치면 그쪽 내용을 사본 노트로 남겼다고 알린다
  useEffect(
    () =>
      store.onConflict((copy) => {
        toast('다른 기기에서 고친 내용과 겹쳐서, 그쪽 내용을 사본 노트로 남겼어요', {
          action: { label: '사본 보기', onClick: () => setOpenId(copy.id) },
        });
      }),
    [store],
  );

  // 로컬 id 가 서버 id 로 바뀌면 열린 노트 id 도 따라간다
  useEffect(
    () =>
      store.onRemap((from, to) => {
        setOpenId((cur) => (cur === from ? to : cur));
      }),
    [store],
  );

  const notes = store.all();
  const openNote: SermonNote | undefined = openId ? store.get(openId) : undefined;

  // 딥링크 id 가 (동기화 후에도) 없으면 목록으로
  useEffect(() => {
    if (openId && !store.status.loading && !store.get(openId)) setOpenId(null);
  }, [openId, store, store.status.loading, notes.length]);

  const handleNew = useCallback(() => {
    const n = store.save(newNote(store.all()[0]));
    setOpenAid(null);
    setOpenId(n.id);
  }, [store]);

  const handleOpen = useCallback((id: string, aid?: string | null) => {
    setOpenAid(aid ?? null);
    setOpenId(id);
  }, []);

  const handleToggleApply = useCallback(
    (noteId: string, thoughtId: string) => {
      const n = store.get(noteId);
      if (!n) return;
      const nn = toggleApplyDone(n, thoughtId);
      store.save(nn);
      const t = nn.thoughts.find((x) => x.id === thoughtId);
      if (t?.done) toast('실천했어요');
    },
    [store],
  );

  // 공유받은 카드에서 「나도 기록하기」 → /sermonnote?start=1&… : 같은 설교 정보로 새 노트를 연다
  // 첫 스티커는 노트 사본을 들고 있는다 (로그인 상태면 곧 서버 id 로 바뀌므로)
  const [firstNote, setFirstNote] = useState<SermonNote | null>(null);
  const startDone = useRef(false);
  useEffect(() => {
    if (startDone.current || store.status.loading) return;
    const seed = readStart(searchParams);
    if (!seed) return;
    startDone.current = true;
    const base = newNote(store.all()[0]);
    const n = store.save(
      seed.title || seed.refs.length
        ? {
            ...base,
            title: seed.title,
            preacher: seed.preacher,
            service: seed.service || base.service,
            date: seed.date || base.date,
            refs: seed.refs,
            body: seed.first ? `<p>${esc(seed.first)}</p>` : '',
          }
        : { ...base, body: seed.first ? `<p>${esc(seed.first)}</p>` : '' },
    );
    setOpenAid(null);
    setOpenId(n.id);
    if (seed.first) setFirstNote(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, store.status.loading]);
  // start 파라미터는 노트를 연 뒤(URL 동기화가 note 를 적은 다음)에 지운다 — 새로고침으로 또 만들지 않게
  useEffect(() => {
    if (startDone.current && openId && readStart(searchParams)) {
      const next = clearStart(searchParams);
      if (!standalone) next.set(PARAM_TAB, 'sermon');
      next.set(PARAM_NOTE, openId);
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, openId, setSearchParams, standalone]);

  // 모임 — 자동 연결·공개 사본·모임 홈/설교 자리 (group/useGroupWiring)
  const groups = useGroupWiring({
    store,
    userId,
    anonymous,
    notes,
    openNote,
    setOpenId: (id) => {
      setOpenAid(null);
      setOpenId(id);
    },
    searchParams,
    setSearchParams,
    onLogin,
  });

  const editing = !!(openId && openNote);
  // 편집기 하단 뒤로의 도착지 — 모임 설교 자리에서 열었으면 모임 이름, 아니면 원래 탭
  const fromGroup = searchParams.get('session') ? searchParams.get('group') : null;
  const backLabel =
    (fromGroup && groups.ctx.store.get(fromGroup)?.name) ||
    BACK_LABEL[searchParams.get(PARAM_TAB) || ''] ||
    '노트';

  return (
    <GroupContext.Provider value={groups.ctx}>
      <ProfileContext.Provider value={profile}>
        <div ref={rootRef} className="sermon-app" data-standalone={standalone || undefined}>
          {!editing && strip(look.mascot)}
          {editing ? (
            <SermonEditor
              key={openNote.id}
              note={openNote}
              store={store}
              userId={userId}
              style={style}
              onStyleChange={onStyleChange}
              onBack={closeNote}
              onDeleted={closeNote}
              backLabel={backLabel}
              initialAid={openAid}
              canAttach={!anonymous}
              onLogin={onLogin}
              mascot={look.mascot}
              groupBand={groups.band}
            />
          ) : openId && store.status.loading ? (
            <div
              style={{ flex: 1, display: 'grid', placeItems: 'center' }}
              role="status"
              aria-label="불러오는 중"
            >
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--sn-accent)' }} />
            </div>
          ) : (
            <SermonList
              notes={notes}
              status={store.status}
              onOpen={handleOpen}
              onNew={handleNew}
              onToggleApply={handleToggleApply}
              onLogin={onLogin}
              mascot={look.mascot}
              onOpenLook={() => setLookOpen(true)}
              groupNav={groups.groupNav}
              main={groups.main}
              standalone={standalone}
              userName={userName}
            />
          )}
          {groups.overlays}
          <FirstSticker
            open={!!firstNote}
            note={firstNote}
            mascot={look.mascot}
            onLogin={onLogin}
            onClose={() => setFirstNote(null)}
          />
          <LookModal
            open={lookOpen}
            look={look}
            onChange={onLookChange}
            onClose={() => setLookOpen(false)}
          />
        </div>
      </ProfileContext.Provider>
    </GroupContext.Provider>
  );
}
