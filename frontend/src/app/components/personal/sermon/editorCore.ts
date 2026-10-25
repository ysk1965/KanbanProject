import { decRef, encRef, refLong, refShort, tailRef, type Ref } from './bibleRefs';
import { esc, uid } from './sermonTypes';
import { getBible, verses } from './useBible';

/**
 * 본문 편집기 핵심 — 기획서 §4 본문 편집기, §6 연결 위치.
 *
 * contenteditable 위에서 말씀 블록(.sn-vblock)·구절 칩(.sn-vchip)·연결 위치(data-aid)·실행 취소를 다룬다.
 * React 는 이 클래스를 ref 로 들고 버튼·패널만 그린다. DOM 은 여기서만 만진다.
 *
 * 저장 형식(body HTML):
 *   <p data-aid>…</p> / <h3 data-aid>…</h3> / <ul><li>…</li></ul>
 *   <div class="sn-vblock" data-ref="42:3:16-16" data-aid="a…" data-marks='{"16":[[0,4]]}' data-collapsed="1"></div>
 *   <span class="sn-vchip" contenteditable="false" data-ref="…">요 3:16</span>
 * 말씀 블록 안쪽은 저장하지 않고 열 때 성경 데이터로 다시 채운다.
 */

export type PtrTarget = 'new' | 'edit';

export interface PtrState {
  el: HTMLElement | null;
  manual: boolean;
  active: boolean;
  target: PtrTarget;
  picking: boolean;
}

export interface EditorCallbacks {
  /** 내용이 바뀜 → 저장 예약 */
  onChange: () => void;
  onHistory: (canUndo: boolean, canRedo: boolean) => void;
  /** 빈 줄에서 `/`, Ctrl+K */
  onOpenPicker: () => void;
  /** 연결 위치(포인터)가 바뀜 → 패널의 연결 줄 다시 그림 */
  onPtrChange: () => void;
  /** 본문에서 고르기 시작/끝 */
  onPickingChange: (picking: boolean) => void;
  toast: (msg: string) => void;
}

const HIST_MAX = 150;
const CHEV =
  '<svg class="sn-icon sn-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

type Marks = Record<string, Array<[number, number]>>;

function mergeIv(a: Array<[number, number]>): Array<[number, number]> {
  const s = a.filter((x) => x[1] > x[0]).sort((x, y) => x[0] - y[0]);
  const o: Array<[number, number]> = [];
  for (const x of s) {
    const l = o[o.length - 1];
    if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]);
    else o.push([x[0], x[1]]);
  }
  return o;
}
function subIv(a: Array<[number, number]>, [s, e]: [number, number]): Array<[number, number]> {
  const o: Array<[number, number]> = [];
  for (const [x, y] of a) {
    if (y <= s || x >= e) {
      o.push([x, y]);
      continue;
    }
    if (x < s) o.push([x, s]);
    if (y > e) o.push([e, y]);
  }
  return o;
}
function covered(a: Array<[number, number]>, [s, e]: [number, number]): boolean {
  let p = s;
  for (const [x, y] of mergeIv(a)) {
    if (x > p) break;
    if (y > p) p = y;
    if (p >= e) return true;
  }
  return p >= e;
}
function markedText(text: string, iv: Array<[number, number]> | undefined): string {
  let h = '';
  let p = 0;
  for (const [s, e] of mergeIv(iv || [])) {
    h += `${esc(text.slice(p, s))}<b>${esc(text.slice(s, e))}</b>`;
    p = e;
  }
  return h + esc(text.slice(p));
}

/** 말씀 본문 HTML (절 번호 + 본문). ctx 면 앞뒤 2절을 흐리게 함께 */
export function verseHTML(r: Ref, ctx: boolean, marks: Marks = {}): string {
  const bible = getBible();
  if (!bible) return '<span class="sn-ctx">본문 불러오는 중…</span>';
  const ch = bible[r.b]?.[r.c - 1] || [];
  let h = '';
  const from = ctx ? Math.max(1, r.v1 - 2) : r.v1;
  const to = ctx ? Math.min(ch.length, r.v2 + 2) : r.v2;
  for (let v = from; v <= to; v++) {
    const inR = v >= r.v1 && v <= r.v2;
    h += `<span class="sn-vline${inR ? '' : ' sn-ctx'}"><sup>${v}</sup><span class="sn-vv" data-v="${v}">${markedText(ch[v - 1] || '', marks[v])}</span> </span>`;
  }
  return h;
}

function getMarks(el: HTMLElement): Marks {
  try {
    return JSON.parse(el.dataset.marks || '{}') as Marks;
  } catch {
    return {};
  }
}
function setMarks(el: HTMLElement, m: Marks) {
  for (const k in m) if (!m[k].length) delete m[k];
  if (Object.keys(m).length) el.dataset.marks = JSON.stringify(m);
  else delete el.dataset.marks;
}

function textOffset(root: Node, node: Node, off: number): number {
  const pre = document.createRange();
  pre.setStart(root, 0);
  pre.setEnd(node, off);
  return pre.toString().length;
}
function closestEl(n: Node | null, sel: string): HTMLElement | null {
  if (!n) return null;
  const el = n.nodeType === 3 ? n.parentElement : (n as HTMLElement);
  return el && el.closest ? el.closest<HTMLElement>(sel) : null;
}

export class EditorCore {
  readonly el: HTMLElement;
  private cb: EditorCallbacks;
  private lastRange: Range | null = null;
  private hist: { stack: string[]; idx: number; t: number | null; restoring: boolean } = {
    stack: [],
    idx: -1,
    t: null,
    restoring: false,
  };
  readonly ptr: PtrState = {
    el: null,
    manual: false,
    active: false,
    target: 'new',
    picking: false,
  };
  private mounted = false;

  constructor(el: HTMLElement, cb: EditorCallbacks) {
    this.el = el;
    this.cb = cb;
  }

  setCallbacks(cb: EditorCallbacks) {
    this.cb = cb;
  }

  // ───────── 수명 ─────────

  mount() {
    if (this.mounted) return;
    this.mounted = true;
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* 지원 안 하는 브라우저 */
    }
    this.el.addEventListener('input', this.onInput);
    this.el.addEventListener('keydown', this.onKeydown);
    this.el.addEventListener('paste', this.onPaste);
    this.el.addEventListener('beforeinput', this.onBeforeInput);
    this.el.addEventListener('click', this.onPickClick, true);
    this.el.addEventListener('click', this.onClick);
    document.addEventListener('selectionchange', this.onSelectionChange);
  }

  unmount() {
    if (!this.mounted) return;
    this.mounted = false;
    if (this.hist.t) window.clearTimeout(this.hist.t);
    this.el.removeEventListener('input', this.onInput);
    this.el.removeEventListener('keydown', this.onKeydown);
    this.el.removeEventListener('paste', this.onPaste);
    this.el.removeEventListener('beforeinput', this.onBeforeInput);
    this.el.removeEventListener('click', this.onPickClick, true);
    this.el.removeEventListener('click', this.onClick);
    document.removeEventListener('selectionchange', this.onSelectionChange);
  }

  // ───────── 본문 넣고 빼기 ─────────

  /** 노트를 열 때. 히스토리도 초기화 */
  load(html: string) {
    this.hist.restoring = true;
    this.el.innerHTML = html || '<p><br></p>';
    this.hydrate();
    this.updateEmpty();
    this.lastRange = null;
    this.hist.restoring = false;
    this.ptr.el = null;
    this.ptr.manual = false;
    this.ptr.active = false;
    this.ptr.target = 'new';
    if (this.ptr.picking) this.endPick();
    this.histReset();
  }

  /** 되돌리기 등으로 본문을 통째로 바꿀 때 */
  setBody(html: string) {
    this.hist.restoring = true;
    this.el.innerHTML = html || '<p><br></p>';
    this.hydrate();
    this.updateEmpty();
    this.lastRange = null;
    this.hist.restoring = false;
    if (this.ptr.el && !this.el.contains(this.ptr.el)) this.ptr.el = null;
    if (this.ptr.active) this.paintPtr();
    this.cb.onChange();
  }

  /** 저장용 HTML — 말씀 블록 안쪽과 임시 표시는 뺀다 */
  serialize(): string {
    const c = this.el.cloneNode(true) as HTMLElement;
    c.querySelectorAll<HTMLElement>('.sn-vblock').forEach((b) => {
      b.innerHTML = '';
      b.removeAttribute('data-ctx');
    });
    c.querySelectorAll<HTMLElement>('.sn-pointed,.sn-peeked,.sn-flash').forEach((x) => {
      x.classList.remove('sn-pointed', 'sn-peeked', 'sn-flash');
      if (!x.className) x.removeAttribute('class');
      x.removeAttribute('data-ptag');
    });
    return c.innerHTML;
  }

  hydrate() {
    this.el.querySelectorAll<HTMLElement>('.sn-vblock').forEach((b) => this.renderBlock(b));
  }

  /** 성경 데이터가 늦게 도착했을 때 */
  refreshVerses() {
    this.hydrate();
  }

  updateEmpty() {
    const empty = !this.el.textContent?.trim() && !this.el.querySelector('.sn-vblock,.sn-vchip');
    this.el.dataset.empty = String(empty);
  }

  isEmpty(): boolean {
    return this.el.dataset.empty === 'true';
  }

  renderBlock(el: HTMLElement) {
    const r = decRef(el.dataset.ref);
    if (!r) {
      el.remove();
      return;
    }
    el.setAttribute('contenteditable', 'false');
    if (!el.dataset.aid) el.dataset.aid = uid('a');
    const ctx = el.dataset.ctx === '1';
    const col = el.dataset.collapsed === '1';
    const first = (verses(r) || [])[0];
    const peek = first ? first[1] : '';
    el.innerHTML =
      `<div class="sn-vh"><button type="button" class="sn-vtog" data-act="tog" aria-expanded="${!col}">${CHEV}<span>${esc(refLong(r))}</span></button>` +
      `<span class="sn-tr">개역한글</span><span class="sn-peek">${esc(peek)}</span>` +
      `<button type="button" class="sn-act sn-hide-sm" data-act="ctx">${ctx ? '문맥 접기' : '앞뒤 문맥'}</button>` +
      `<button type="button" class="sn-act sn-hide-sm" data-act="copy">복사</button>` +
      `<button type="button" class="sn-act" data-act="rm" aria-label="구절 삭제">삭제</button></div>` +
      `<div class="sn-vt">${verseHTML(r, ctx, getMarks(el))}</div>`;
  }

  // ───────── 선택 영역 ─────────

  private onSelectionChange = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (this.el.contains(r.startContainer)) {
      this.lastRange = r.cloneRange();
      if (!this.ptr.picking && this.ptr.target === 'new') this.autoPtr();
    }
  };

  private restoreRange(): Range {
    this.el.focus({ preventScroll: true });
    const sel = window.getSelection() as Selection;
    sel.removeAllRanges();
    const lr = this.lastRange;
    const inBlock = lr ? closestEl(lr.startContainer, '.sn-vblock') : null;
    if (inBlock) {
      const r = document.createRange();
      r.setStartAfter(inBlock);
      r.collapse(true);
      sel.addRange(r);
    } else if (lr && this.el.contains(lr.startContainer)) {
      sel.addRange(lr);
    } else {
      const r = document.createRange();
      r.selectNodeContents(this.el);
      r.collapse(false);
      sel.addRange(r);
    }
    return sel.getRangeAt(0);
  }

  private topChild(node: Node | null): HTMLElement | Node | null {
    let n: Node | null = node;
    while (n && n.parentNode !== this.el) n = n.parentNode;
    return n;
  }

  private caretAfter(node: Node) {
    const r = document.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    const s = window.getSelection() as Selection;
    s.removeAllRanges();
    s.addRange(r);
    this.lastRange = r.cloneRange();
  }

  focus() {
    this.restoreRange();
  }

  // ───────── 구절 넣기 ─────────

  insertBlock(ref: Ref) {
    this.snapNow();
    const rng = this.restoreRange();
    const el = document.createElement('div');
    el.className = 'sn-vblock';
    el.dataset.ref = encRef(ref);
    el.dataset.aid = uid('a');
    this.renderBlock(el);
    const startNode =
      rng.startContainer === this.el
        ? this.el.childNodes[rng.startOffset - 1] || this.el.firstChild
        : rng.startContainer;
    const tc = this.topChild(startNode) as HTMLElement | null;
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    if (tc) {
      const emptyLine =
        tc.nodeType === 1 &&
        !tc.classList.contains('sn-vblock') &&
        !tc.textContent?.trim() &&
        !tc.querySelector('.sn-vchip');
      if (emptyLine) tc.replaceWith(el);
      else tc.after(el);
    } else this.el.appendChild(el);
    el.after(p);
    const r = document.createRange();
    r.setStart(p, 0);
    r.collapse(true);
    const s = window.getSelection() as Selection;
    s.removeAllRanges();
    s.addRange(r);
    this.lastRange = r.cloneRange();
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    this.updateEmpty();
    this.cb.onChange();
  }

  private makeChip(ref: Ref): HTMLSpanElement {
    const c = document.createElement('span');
    c.className = 'sn-vchip';
    c.contentEditable = 'false';
    c.dataset.ref = encRef(ref);
    c.textContent = refShort(ref);
    return c;
  }

  insertChip(ref: Ref) {
    this.snapNow();
    const rng = this.restoreRange();
    rng.deleteContents();
    const c = this.makeChip(ref);
    const sp = document.createTextNode(' ');
    rng.insertNode(sp);
    rng.insertNode(c);
    this.caretAfter(sp);
    this.updateEmpty();
    this.cb.onChange();
  }

  // ───────── 입력 이벤트 ─────────

  private onInput = (e: Event) => {
    this.updateEmpty();
    this.cb.onChange();
    this.snapSoon();
    const ie = e as InputEvent;
    if (ie.inputType === 'insertText' && (ie.data === ' ' || ie.data === '\u00a0')) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      const node = r.startContainer;
      if (node.nodeType !== 3) return;
      const before = (node.textContent || '').slice(0, r.startOffset);
      const t = before.replace(/[\s\u00a0]$/, '');
      const hit = tailRef(t);
      if (!hit) return;
      this.snapNow();
      const rr = document.createRange();
      rr.setStart(node, hit.start);
      rr.setEnd(node, r.startOffset);
      rr.deleteContents();
      const c = this.makeChip(hit.ref);
      const sp = document.createTextNode(' ');
      rr.insertNode(sp);
      rr.insertNode(c);
      this.caretAfter(sp);
      this.cb.onChange();
    }
  };

  private onKeydown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (k === 'y') {
        e.preventDefault();
        this.redo();
        return;
      }
      if (k === 'b') {
        this.snapNow();
        if (this.boldInVerse()) {
          e.preventDefault();
          return;
        }
      }
      if (k === 'k') {
        e.preventDefault();
        this.cb.onOpenPicker();
        return;
      }
      if (k === 'e' && !e.shiftKey) {
        // 제목 ↔ 본문 (⌘E — 브라우저 예약 키가 아니라 어디서나 닿는다)
        e.preventDefault();
        this.format('h3');
        return;
      }
    }
    if (
      e.key === ' ' &&
      !e.isComposing &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      this.prefixShortcut()
    ) {
      e.preventDefault();
      return;
    }
    if (e.key === '/' && !e.isComposing) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      const tc = this.topChild(r.startContainer) as HTMLElement | null;
      const lineEmpty =
        !tc ||
        (tc as Node) === this.el ||
        (!tc.textContent?.trim() && !(tc.querySelector && tc.querySelector('.sn-vchip')));
      if (lineEmpty) {
        e.preventDefault();
        this.lastRange = r.cloneRange();
        this.cb.onOpenPicker();
      }
    }
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
      const r = sel.getRangeAt(0);
      const tc = this.topChild(r.startContainer) as HTMLElement | null;
      // 제목 첫머리에서 ⌫ → 글자를 지우는 대신 본문으로 (`# ` 로 만든 제목을 한 번에 되돌림)
      if (tc && tc.nodeName === 'H3' && textOffset(tc, r.startContainer, r.startOffset) === 0) {
        e.preventDefault();
        this.snapNow();
        const p = this.replaceBlock(tc, 'p');
        this.caretIn(p);
        this.cb.onChange();
        return;
      }
      const prev = tc?.previousSibling as HTMLElement | null;
      if (
        tc &&
        r.startOffset === 0 &&
        prev &&
        prev.classList &&
        prev.classList.contains('sn-vblock') &&
        (r.startContainer === tc || r.startContainer === tc.firstChild)
      ) {
        e.preventDefault();
        this.snapNow();
        if (!tc.textContent?.trim()) tc.remove();
        else prev.remove();
        this.cb.onChange();
        this.updateEmpty();
      }
    }
  };

  private onPaste = (e: ClipboardEvent) => {
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (t == null) return;
    e.preventDefault();
    this.snapNow();
    document.execCommand('insertText', false, t);
  };

  private onBeforeInput = (e: Event) => {
    const ie = e as InputEvent;
    if (ie.inputType === 'historyUndo') {
      e.preventDefault();
      this.undo();
    } else if (ie.inputType === 'historyRedo') {
      e.preventDefault();
      this.redo();
    }
  };

  private onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('.sn-vblock [data-act]');
    if (btn) {
      e.preventDefault();
      const bl = btn.closest<HTMLElement>('.sn-vblock');
      if (!bl) return;
      const a = btn.dataset.act;
      if (a === 'tog' || a === 'rm') this.snapNow();
      if (a === 'tog') {
        if (bl.dataset.collapsed === '1') delete bl.dataset.collapsed;
        else bl.dataset.collapsed = '1';
        this.renderBlock(bl);
        this.cb.onChange();
      }
      if (a === 'ctx') {
        bl.dataset.ctx = bl.dataset.ctx === '1' ? '0' : '1';
        this.renderBlock(bl);
      }
      if (a === 'rm') {
        bl.remove();
        this.cb.onChange();
        this.updateEmpty();
      }
      if (a === 'copy') {
        const r = decRef(bl.dataset.ref);
        if (!r) return;
        const t = `${refLong(r)}\n${(verses(r) || []).map(([v, x]) => `${v} ${x}`).join('\n')}`;
        navigator.clipboard?.writeText(t).then(
          () => this.cb.toast('구절을 복사했어요'),
          () => this.cb.toast('복사할 수 없어요. 본문을 길게 눌러 선택해 주세요'),
        );
      }
      return;
    }
    const chip = target.closest<HTMLElement>('.sn-vchip');
    if (chip) {
      const r = decRef(chip.dataset.ref);
      if (r) {
        const vs = verses(r) || [];
        const joined = vs.map((x) => x[1]).join(' ');
        this.cb.toast(`${refShort(r)}  ${joined.slice(0, 120)}${joined.length > 120 ? '…' : ''}`);
      }
    }
  };

  // ───────── 말씀 안 강조 ─────────

  private verseSelection(): Range | null {
    const sel = window.getSelection();
    let r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    const ok = (x: Range | null) =>
      !!x &&
      !x.collapsed &&
      (closestEl(x.startContainer, '.sn-vt') || closestEl(x.endContainer, '.sn-vt'));
    if (!ok(r)) r = ok(this.lastRange) ? this.lastRange : null;
    return r;
  }

  /** 말씀 본문 선택 영역을 강조/해제. 처리했으면 true */
  boldInVerse(): boolean {
    const r = this.verseSelection();
    if (!r) return false;
    const vtEl = closestEl(r.startContainer, '.sn-vt') || closestEl(r.endContainer, '.sn-vt');
    if (!vtEl) return false;
    const bl = vtEl.closest<HTMLElement>('.sn-vblock');
    if (!bl) return false;
    const segs: Array<[string, [number, number]]> = [];
    vtEl.querySelectorAll<HTMLElement>('.sn-vv').forEach((vv) => {
      if (!r.intersectsNode(vv)) return;
      const len = (vv.textContent || '').length;
      const s = vv.contains(r.startContainer) ? textOffset(vv, r.startContainer, r.startOffset) : 0;
      const e = vv.contains(r.endContainer) ? textOffset(vv, r.endContainer, r.endOffset) : len;
      if (e > s) segs.push([vv.dataset.v as string, [Math.max(0, s), Math.min(len, e)]]);
    });
    if (!segs.length) return true;
    const m = getMarks(bl);
    const allOn = segs.every(([v, iv]) => covered(m[v] || [], iv));
    segs.forEach(([v, iv]) => {
      m[v] = allOn ? subIv(mergeIv(m[v] || []), iv) : mergeIv([...(m[v] || []), iv]);
    });
    setMarks(bl, m);
    this.renderBlock(bl);
    window.getSelection()?.removeAllRanges();
    this.lastRange = null;
    this.cb.onChange();
    return true;
  }

  // ───────── 서식 ─────────

  /** 블록 태그를 바꾼다. 내용과 연결 위치(data-aid)는 그대로 */
  private replaceBlock(tc: HTMLElement, tag: 'p' | 'h3'): HTMLElement {
    const n = document.createElement(tag);
    n.innerHTML = tc.innerHTML.trim() ? tc.innerHTML : '<br>';
    if (tc.dataset.aid) n.dataset.aid = tc.dataset.aid;
    tc.replaceWith(n);
    return n;
  }

  private caretIn(el: HTMLElement) {
    const r = document.createRange();
    r.setStart(el, 0);
    r.collapse(true);
    const s = window.getSelection() as Selection;
    s.removeAllRanges();
    s.addRange(r);
    this.lastRange = r.cloneRange();
  }

  /** 빈 줄 첫머리 `#`+띄어쓰기 → 제목, `-`+띄어쓰기 → 목록. 처리했으면 true */
  private prefixShortcut(): boolean {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    const r = sel.getRangeAt(0);
    const tc = this.topChild(r.startContainer) as HTMLElement | null;
    if (!tc || tc.nodeType !== 1 || (tc as Node) === this.el) return false;
    if (tc.nodeName !== 'P' && tc.nodeName !== 'DIV') return false;
    if (tc.classList.contains('sn-vblock') || tc.querySelector('.sn-vchip')) return false;
    const raw = tc.textContent || '';
    const t = raw.replace(/ /g, ' ').trim();
    if (t !== '#' && t !== '-') return false;
    if (textOffset(tc, r.startContainer, r.startOffset) < raw.length) return false;
    this.snapNow();
    tc.innerHTML = '<br>';
    if (t === '#') {
      this.caretIn(this.replaceBlock(tc, 'h3'));
    } else {
      const ul = document.createElement('ul');
      const li = document.createElement('li');
      li.innerHTML = '<br>';
      ul.appendChild(li);
      tc.replaceWith(ul);
      this.caretIn(li);
    }
    this.updateEmpty();
    this.cb.onChange();
    return true;
  }

  /** 범위의 글을 다른 글로 바꾼다 (AI 문장 정리). 되돌리기 한 단계로 남는다 */
  replaceRangeText(range: Range, text: string) {
    if (!this.el.contains(range.commonAncestorContainer)) return;
    this.snapNow();
    this.el.focus({ preventScroll: true });
    const sel = window.getSelection() as Selection;
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertText', false, text);
    this.lastRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    this.updateEmpty();
    this.cb.onChange();
  }

  format(cmd: 'h3' | 'bold' | 'list') {
    this.snapNow();
    if (cmd === 'bold' && this.boldInVerse()) return;
    this.restoreRange();
    if (cmd === 'h3') {
      const sel = window.getSelection();
      const tc =
        sel && sel.rangeCount
          ? (this.topChild(sel.getRangeAt(0).startContainer) as HTMLElement | null)
          : null;
      document.execCommand('formatBlock', false, tc && tc.nodeName === 'H3' ? 'p' : 'h3');
    }
    if (cmd === 'bold') document.execCommand('bold');
    if (cmd === 'list') document.execCommand('insertUnorderedList');
    this.cb.onChange();
  }

  // ───────── 실행 취소 ─────────

  private histUI() {
    this.cb.onHistory(
      this.hist.idx > 0 || !!this.hist.t,
      this.hist.idx < this.hist.stack.length - 1,
    );
  }
  private histReset() {
    if (this.hist.t) window.clearTimeout(this.hist.t);
    this.hist.t = null;
    this.hist.stack = [this.serialize()];
    this.hist.idx = 0;
    this.histUI();
  }
  snapNow() {
    if (this.hist.t) window.clearTimeout(this.hist.t);
    this.hist.t = null;
    if (this.hist.restoring) {
      this.histUI();
      return;
    }
    const h = this.serialize();
    if (this.hist.stack[this.hist.idx] !== h) {
      this.hist.stack = this.hist.stack.slice(0, this.hist.idx + 1);
      this.hist.stack.push(h);
      if (this.hist.stack.length > HIST_MAX) this.hist.stack.shift();
      this.hist.idx = this.hist.stack.length - 1;
    }
    this.histUI();
  }
  private snapSoon() {
    if (this.hist.restoring) return;
    if (this.hist.t) window.clearTimeout(this.hist.t);
    this.hist.t = window.setTimeout(() => this.snapNow(), 800);
    this.histUI();
  }
  undo() {
    this.snapNow();
    if (this.hist.idx <= 0) {
      this.cb.toast('더 되돌릴 내용이 없어요');
      return;
    }
    this.hist.idx--;
    this.setBody(this.hist.stack[this.hist.idx]);
    this.histUI();
  }
  redo() {
    this.snapNow();
    if (this.hist.idx >= this.hist.stack.length - 1) return;
    this.hist.idx++;
    this.setBody(this.hist.stack[this.hist.idx]);
    this.histUI();
  }

  // ───────── 연결 위치 (생각이 붙을 본문 문단) ─────────

  private isContent(n: Node | null): boolean {
    const el = n as HTMLElement | null;
    return (
      !!el &&
      el.nodeType === 1 &&
      el.parentNode === this.el &&
      (el.classList.contains('sn-vblock') ||
        !!el.textContent?.trim() ||
        !!el.querySelector?.('.sn-vchip,img'))
    );
  }
  prevContent(n: HTMLElement | null): HTMLElement | null {
    for (
      let x = n?.previousElementSibling as HTMLElement | null;
      x;
      x = x.previousElementSibling as HTMLElement | null
    ) {
      if (this.isContent(x)) return x;
    }
    return null;
  }
  nextContent(n: HTMLElement | null): HTMLElement | null {
    for (
      let x = n?.nextElementSibling as HTMLElement | null;
      x;
      x = x.nextElementSibling as HTMLElement | null
    ) {
      if (this.isContent(x)) return x;
    }
    return null;
  }
  private anchorCandidate(): HTMLElement | null {
    let n: Node | null =
      this.lastRange && this.el.contains(this.lastRange.startContainer)
        ? this.topChild(this.lastRange.startContainer)
        : null;
    if (n && n.nodeType !== 1) {
      const asText = n as CharacterData;
      n = asText.previousElementSibling || asText.nextElementSibling;
    }
    if (!n) n = this.el.lastElementChild;
    if (n && !this.isContent(n))
      n = this.prevContent(n as HTMLElement) || this.nextContent(n as HTMLElement);
    return n && this.isContent(n) ? (n as HTMLElement) : null;
  }
  labelFor(el: HTMLElement | null): string | null {
    if (!el) return null;
    if (el.classList.contains('sn-vblock')) {
      const r = decRef(el.dataset.ref);
      return r ? refShort(r) : '구절';
    }
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (el.nodeName === 'H3') return t.slice(0, 24);
    return t.length > 16 ? `${t.slice(0, 16)}…` : t;
  }
  /** 현재 포인터가 가리키는 요소에 aid 를 보장하고 돌려준다 */
  currentAnchor(): { aid: string | null; label: string | null } {
    const el = this.ptr.el && this.el.contains(this.ptr.el) ? this.ptr.el : null;
    if (!el) return { aid: null, label: null };
    if (!el.dataset.aid) el.dataset.aid = uid('a');
    return { aid: el.dataset.aid, label: this.labelFor(el) };
  }
  ptrEl(): HTMLElement | null {
    return this.ptr.el && this.el.contains(this.ptr.el) ? this.ptr.el : null;
  }
  paintPtr() {
    this.el.querySelectorAll<HTMLElement>('.sn-pointed').forEach((x) => {
      if (x !== this.ptr.el || !this.ptr.active) {
        x.classList.remove('sn-pointed');
        delete x.dataset.ptag;
      }
    });
    if (this.ptr.active && this.ptr.el && this.el.contains(this.ptr.el)) {
      this.ptr.el.classList.add('sn-pointed');
      this.ptr.el.dataset.ptag = this.ptr.target === 'edit' ? '수정 중인 생각' : '생각이 연결될 곳';
    }
    this.cb.onPtrChange();
  }
  autoPtr() {
    if (this.ptr.manual) return;
    const next = this.anchorCandidate();
    if (next === this.ptr.el && !this.ptr.active) return;
    this.ptr.el = next;
    this.paintPtr();
  }
  setPtrActive(on: boolean) {
    this.ptr.active = on;
    this.paintPtr();
  }
  /** 생각 입력창 포커스: 새 생각 모드로 포인터 켬 */
  beginNew() {
    this.ptr.target = 'new';
    this.ptr.manual = false;
    this.ptr.el = this.anchorCandidate();
    this.ptr.active = true;
    this.paintPtr();
  }
  /** 생각 수정 시작: 그 생각의 위치를 가리킴 */
  beginEdit(aid: string | null, label: string | null) {
    this.ptr.target = 'edit';
    this.ptr.el = this.findAnchorEl(aid, label);
    this.ptr.manual = true;
    this.ptr.active = true;
    this.paintPtr();
    this.ptr.el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  /** 수정 끝 → 새 생각 모드로 */
  endEdit() {
    this.ptr.target = 'new';
    this.ptr.manual = false;
    this.ptr.active = false;
    this.ptr.el = this.anchorCandidate();
    this.paintPtr();
  }
  /** 새 생각 저장 뒤: 수동 지정 해제, 적던 곳으로 */
  afterAdd() {
    this.ptr.manual = false;
    this.autoPtr();
  }
  ancAction(a: 'up' | 'down' | 'none' | 'auto' | 'pick') {
    if (a === 'pick') {
      this.startPick();
      return;
    }
    if (a === 'up') {
      const p = this.prevContent(this.ptr.el);
      if (p) {
        this.ptr.el = p;
        this.ptr.manual = true;
      }
    }
    if (a === 'down') {
      const n = this.nextContent(this.ptr.el);
      if (n) {
        this.ptr.el = n;
        this.ptr.manual = true;
      }
    }
    if (a === 'none') {
      this.ptr.el = null;
      this.ptr.manual = true;
    }
    if (a === 'auto') {
      this.ptr.manual = false;
      this.ptr.el = this.anchorCandidate();
    }
    this.ptr.active = true;
    this.paintPtr();
    this.ptr.el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  startPick() {
    this.ptr.picking = true;
    this.ptr.active = true;
    this.paintPtr();
    this.el.dataset.picking = 'true';
    this.el.setAttribute('contenteditable', 'false');
    this.cb.onPickingChange(true);
  }
  endPick() {
    this.ptr.picking = false;
    delete this.el.dataset.picking;
    this.el.setAttribute('contenteditable', 'true');
    this.paintPtr();
    this.cb.onPickingChange(false);
  }
  private onPickClick = (e: MouseEvent) => {
    if (!this.ptr.picking) return;
    e.preventDefault();
    e.stopPropagation();
    const n = this.topChild(e.target as Node) as HTMLElement | null;
    if (n && n.nodeType === 1 && this.isContent(n)) {
      this.ptr.el = n as HTMLElement;
      this.ptr.manual = true;
    }
    this.endPick();
  };

  findAnchorEl(
    aid: string | null | undefined,
    label: string | null | undefined,
  ): HTMLElement | null {
    let el: HTMLElement | null = aid
      ? this.el.querySelector<HTMLElement>(`[data-aid="${CSS.escape(aid)}"]`)
      : null;
    if (!el && label) {
      const blocks = [...this.el.querySelectorAll<HTMLElement>('.sn-vblock')];
      const heads = [...this.el.querySelectorAll<HTMLElement>('h3')];
      const chips = [...this.el.querySelectorAll<HTMLElement>('.sn-vchip')];
      el =
        blocks.find((b) => {
          const r = decRef(b.dataset.ref);
          return r && refShort(r) === label;
        }) ||
        heads.find((h) => (h.textContent || '').trim().slice(0, 24) === label) ||
        chips.find((c) => c.textContent === label) ||
        null;
      if (el && el.classList.contains('sn-vchip')) el = this.topChild(el) as HTMLElement | null;
    }
    return el || null;
  }

  /** 생각을 누르면 본문의 연결 위치로. 접힌 말씀이면 펼친다 */
  jumpTo(aid: string | null | undefined, label: string | null | undefined): boolean {
    const el = this.findAnchorEl(aid, label);
    if (!el) {
      this.cb.toast('연결된 본문 위치가 지워졌어요');
      return false;
    }
    if (el.dataset.collapsed === '1') {
      delete el.dataset.collapsed;
      this.renderBlock(el);
    }
    el.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
    el.classList.remove('sn-flash');
    void el.offsetWidth;
    el.classList.add('sn-flash');
    return true;
  }

  /** 마우스를 올린 생각의 위치를 본문에 살짝 표시 */
  peek(aid: string | null | undefined, label: string | null | undefined) {
    this.unpeek();
    const el = this.findAnchorEl(aid, label);
    if (el && !el.classList.contains('sn-pointed')) el.classList.add('sn-peeked');
  }
  unpeek() {
    this.el.querySelectorAll('.sn-peeked').forEach((x) => x.classList.remove('sn-peeked'));
  }
}
