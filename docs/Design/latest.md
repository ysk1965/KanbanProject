---
title: Design System
version: 1.0.0
updated: 2026-02-02
history:
  - v1.0.0: 2026-02-02
---

# Design System - BRIDGE Theme

## 컬러 팔레트

### Primary Colors

| 이름 | 변수 | Dark Mode | Light Mode | 용도 |
|------|------|-----------|------------|------|
| Bridge Dark | `--bridge-dark` | `#0A0E17` | `#F8FAFC` | 메인 배경 |
| Bridge Obsidian | `--bridge-obsidian` | `#0F1419` | `#FFFFFF` | 카드/헤더 배경 |
| Bridge Accent | `--bridge-accent` | `#6366F1` | `#6366F1` | 주요 액센트 (인디고) |
| Bridge Secondary | `--bridge-secondary` | `#2DD4BF` | `#14B8A6` | 보조 액센트 (틸) |

### Kanban Theme Colors

| 이름 | 변수 | Dark Mode | Light Mode | 용도 |
|------|------|-----------|------------|------|
| Background | `--kanban-bg` | `#0c0c0f` | `#F1F5F9` | 칸반 배경 |
| Card | `--kanban-card` | `#121216` | `#FFFFFF` | 카드 배경 |
| Card Hover | `--kanban-card-hover` | `#1e1e24` | `#F8FAFC` | 카드 호버 |
| Border | `--kanban-border` | `#2a2a32` | `#E2E8F0` | 테두리 |
| Border Hover | `--kanban-border-hover` | `#3a3a45` | `#CBD5E1` | 테두리 호버 |
| Surface | `--kanban-surface` | `#252530` | `#F8FAFC` | 서피스 |
| Input | `--kanban-input` | `#0a0a0d` | `#FFFFFF` | 입력 필드 |

### Status Colors

| 이름 | HEX | 용도 |
|------|-----|------|
| Success | `#10B981` | 성공, 완료 |
| Warning | `#F59E0B` | 경고, 주의 |
| Error | `#EF4444` | 오류, 위험 |
| Info | `#3B82F6` | 정보 |

### Text Colors

| 용도 | Dark Mode | Light Mode |
|------|-----------|------------|
| Primary | `text-white` | `text-slate-900` |
| Secondary | `text-slate-400` | `text-slate-600` |
| Muted | `text-slate-500` | `text-slate-500` |
| Disabled | `text-slate-600` | `text-slate-400` |

---

## 타이포그래피

### 폰트 패밀리

- **Heading**: `font-serif` (serif 계열)
- **Body**: 시스템 기본 폰트 (sans-serif)
- **Code**: `font-mono` (monospace)

### 텍스트 스타일

| 스타일 | 클래스 | 용도 |
|--------|--------|------|
| H1 | `font-serif text-4xl font-bold tracking-tight` | 페이지 제목 |
| H2 | `font-serif text-2xl font-bold tracking-tight` | 섹션 제목 |
| H3 | `text-lg font-semibold` | 서브 섹션 |
| Body | `text-base font-light leading-relaxed` | 본문 |
| Label | `text-[11px] font-bold uppercase tracking-widest text-slate-400` | 라벨 |
| Small | `text-[10px] tracking-[0.3em] uppercase` | 작은 텍스트 |
| Caption | `text-xs text-slate-500` | 캡션 |

---

## 컴포넌트 스타일

### 카드

```css
/* 기본 카드 */
.card {
  @apply bg-bridge-obsidian rounded-2xl border border-white/5 p-6;
}

/* 칸반 카드 */
.kanban-card {
  background: var(--kanban-card);
  border: 1px solid var(--kanban-border);
  border-radius: 12px;
  transition: all 0.2s;
}

.kanban-card:hover {
  background: var(--kanban-card-hover);
  border-color: var(--kanban-border-hover);
}
```

### 버튼

| 타입 | 클래스 |
|------|--------|
| Primary | `px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]` |
| Secondary | `px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10` |
| Ghost | `text-slate-400 hover:text-white hover:bg-white/5` |
| Danger | `px-6 py-3 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20` |

### 입력 필드

```css
.input {
  @apply w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4
    text-white placeholder-slate-600
    focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
    transition-all;
}
```

### 모달/다이얼로그

```css
.modal {
  @apply bg-bridge-obsidian rounded-2xl border border-white/10 p-6 shadow-2xl;
}
```

### 뱃지

```css
/* Priority Badges */
.badge-high { @apply bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-xs; }
.badge-medium { @apply bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full text-xs; }
.badge-low { @apply bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full text-xs; }

/* Tier Badges */
.badge-trial { @apply bg-purple-500/20 text-purple-400; }
.badge-standard { @apply bg-slate-500/20 text-slate-400; }
.badge-premium { @apply bg-bridge-accent/20 text-bridge-accent; }
```

---

## 효과 & 애니메이션

### Glass Morphism

```css
.glass {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.login-glass {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
```

### 애니메이션

| 이름 | 클래스 | 설명 |
|------|--------|------|
| Fade In Up | `animate-fade-in-up` | 위로 페이드인 |
| Float | `animate-float` | 떠다니는 효과 |
| Spot Pulse | `animate-spot` | 점 펄스 |
| Spin Slow | `animate-spin-slow` | 느린 회전 |
| Shimmer | `text-shimmer` | 텍스트 그라데이션 애니메이션 |

### Framer Motion 패턴

```tsx
// 기본 페이드인
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
/>

// 순차 등장
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: index * 0.1 }}
/>
```

### 글로우 효과

```css
/* 인디고 텍스트 글로우 */
.text-glow-indigo { text-shadow: 0 0 20px rgba(99,102,241,0.5); }

/* 시안 텍스트 글로우 */
.text-glow-cyan { text-shadow: 0 0 20px rgba(45,212,191,0.5); }

/* 칸반 카드 호버 글로우 */
.kanban-glow:hover { box-shadow: 0 4px 20px rgba(99,102,241,0.1); }

/* 프로그레스 바 글로우 */
.progress-glow { box-shadow: 0 0 8px rgba(99,102,241,0.4); }
```

---

## 레이아웃 패턴

### 헤더

```css
header {
  @apply bg-bridge-obsidian border-b border-white/5;
  /* glass 클래스 적용 시 backdrop-blur */
}
```

### 섹션 구분

```css
section {
  @apply py-20 bg-bridge-dark border-y border-white/5;
}
```

### 테두리 규칙

| 용도 | 클래스 |
|------|--------|
| 기본 | `border border-white/5` |
| 강조 | `border border-white/10` |
| 액센트 | `border border-bridge-accent/50` |
| 호버 | `hover:border-white/20` |

### 라운딩

| 용도 | 클래스 |
|------|--------|
| 카드 | `rounded-2xl` |
| 버튼 | `rounded-xl` |
| 인풋 | `rounded-xl` |
| 뱃지 | `rounded-full` |
| 작은 요소 | `rounded-lg` |

### 그림자

| 용도 | 클래스 |
|------|--------|
| 카드 | `shadow-lg` |
| 모달 | `shadow-2xl` |
| 액센트 글로우 | `shadow-[0_0_30px_rgba(99,102,241,0.3)]` |

---

## 아이콘

**Lucide React** + **MUI Icons** (레거시)

```tsx
import { Plus, Users, Settings, Trash2 } from 'lucide-react';
<Plus className="h-4 w-4" />
```

---

## 반응형 디자인

```css
/* Mobile First */
.container { @apply p-4 md:p-8 lg:p-12; }

/* Grid */
.grid { @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4; }

/* Typography */
h1 { @apply text-2xl md:text-4xl lg:text-6xl; }
```

---

## 다크/라이트 모드

- **기본**: 다크 모드
- **전환**: `ThemeContext.tsx`에서 `toggleTheme()` 호출
- **저장**: `localStorage` 및 서버 (User.theme 필드)
- **적용**: CSS 변수 + Tailwind `dark:` 클래스

```css
/* theme.css */
:root { /* 다크 모드 기본 */ }
:root.light { /* 라이트 모드 오버라이드 */ }
```
