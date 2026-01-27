# BRIDGE - 디자인 시스템 v8.0

> 이 문서는 BRIDGE 서비스의 디자인 시스템을 정의합니다.
>
> **관련 문서**
> - [서비스 개요](./overview.md)
> - [기능 상세](./features.md)
> - [정보 구조 (IA)](./ia.md)

---

## 1. 색상 팔레트

### 1.1 Primary Colors

| 이름 | CSS 변수 | HEX | 용도 |
|------|---------|-----|------|
| Bridge Dark | `--bridge-dark` | `#0A0E17` | 메인 배경 |
| Bridge Obsidian | `--bridge-obsidian` | `#0F1419` | 카드/헤더 배경 |
| Bridge Accent | `--bridge-accent` | `#6366F1` | 주요 액센트 (인디고) |
| Bridge Secondary | `--bridge-secondary` | `#2DD4BF` | 보조 액센트 (틸) |

### 1.2 Status Colors

| 상태 | CSS 변수 | HEX | 용도 |
|------|---------|-----|------|
| Success | `--status-success` | `#10B981` | 완료, 성공, 정상 |
| Warning | `--status-warning` | `#F59E0B` | 마감 임박, 주의 |
| Error | `--status-error` | `#EF4444` | 오류, 마감 초과, 과열 |
| Info | `--status-info` | `#3B82F6` | 정보, 진행 중, 여유 |

### 1.3 Text Colors

| 용도 | CSS 변수 | HEX |
|------|---------|-----|
| Primary | `--text-primary` | `#FFFFFF` |
| Secondary | `--text-secondary` | `#94A3B8` |
| Muted | `--text-muted` | `#64748B` |

### 1.4 사용 예시

```tsx
// 배경
<div className="bg-bridge-dark" />           // 메인 배경
<div className="bg-bridge-obsidian" />       // 카드/섹션 배경

// 텍스트
<span className="text-bridge-accent" />      // 강조 텍스트
<span className="text-bridge-secondary" />   // 보조 강조

// 버튼
<button className="bg-bridge-accent hover:bg-bridge-accent/90" />

// 테두리
<div className="border border-white/10" />   // 기본 테두리
<div className="border border-bridge-accent/50" /> // 강조 테두리
```

---

## 2. 타이포그래피

### 2.1 폰트 패밀리

| 용도 | 클래스 | 설명 |
|------|--------|------|
| 헤딩 | `font-serif` | 제목, 강조 텍스트 |
| 본문 | 기본 (sans-serif) | 일반 텍스트 |
| 코드 | `font-mono` | 코드, 숫자 |

### 2.2 텍스트 스타일

```tsx
// 대제목 (H1)
<h1 className="font-serif text-4xl font-bold tracking-tight text-white">
  제목
</h1>

// 중제목 (H2)
<h2 className="font-serif text-2xl font-bold text-white">
  중제목
</h2>

// 소제목 (H3)
<h3 className="text-lg font-semibold text-white">
  소제목
</h3>

// 라벨
<label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
  라벨
</label>

// 본문
<p className="text-slate-400 font-light leading-relaxed">
  본문 텍스트
</p>

// 작은 텍스트
<span className="text-[10px] tracking-[0.3em] uppercase text-slate-500">
  작은 텍스트
</span>
```

---

## 3. 컴포넌트 스타일

### 3.1 카드

```tsx
// 기본 카드
<div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
  {/* 카드 내용 */}
</div>

// 호버 효과 카드
<div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6
  hover:border-white/10 hover:shadow-lg transition-all">
  {/* 카드 내용 */}
</div>

// 강조 카드
<div className="bg-bridge-obsidian rounded-2xl border border-bridge-accent/30 p-6
  shadow-[0_0_30px_rgba(99,102,241,0.1)]">
  {/* 카드 내용 */}
</div>
```

### 3.2 버튼

```tsx
// Primary 버튼
<button className="px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold
  hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]
  transition-all">
  버튼
</button>

// Secondary 버튼
<button className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl
  hover:bg-white/10 transition-all">
  버튼
</button>

// Ghost 버튼
<button className="px-4 py-2 text-slate-400
  hover:text-white hover:bg-white/5 rounded-lg transition-colors">
  버튼
</button>

// Danger 버튼
<button className="px-6 py-3 bg-red-500/20 text-red-400 border border-red-500/30
  rounded-xl hover:bg-red-500/30 transition-all">
  삭제
</button>

// 비활성화 버튼
<button className="px-6 py-3 bg-white/5 text-slate-600 rounded-xl cursor-not-allowed"
  disabled>
  비활성화
</button>
```

### 3.3 입력 필드

```tsx
// 기본 입력
<input className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4
  text-white placeholder-slate-600
  focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
  transition-all" />

// 에러 상태
<input className="w-full bg-white/5 border border-red-500/50 rounded-xl py-3 px-4
  text-white placeholder-slate-600
  focus:outline-none focus:ring-2 focus:ring-red-500/50
  transition-all" />

// 텍스트 영역
<textarea className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4
  text-white placeholder-slate-600 resize-none
  focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
  transition-all" />
```

### 3.4 모달/다이얼로그

```tsx
// 모달 오버레이
<div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />

// 모달 컨테이너
<div className="bg-bridge-obsidian rounded-2xl border border-white/10 p-6
  shadow-2xl max-w-md w-full">
  {/* 모달 내용 */}
</div>

// 모달 헤더
<div className="flex items-center justify-between mb-6">
  <h2 className="text-xl font-bold text-white">모달 제목</h2>
  <button className="text-slate-400 hover:text-white">
    <X className="h-5 w-5" />
  </button>
</div>

// 모달 푸터
<div className="flex justify-end gap-3 mt-6 pt-6 border-t border-white/10">
  <button className="...">취소</button>
  <button className="...">확인</button>
</div>
```

### 3.5 드롭다운/셀렉트

```tsx
// 드롭다운 트리거
<button className="flex items-center gap-2 px-4 py-2 bg-white/5
  border border-white/10 rounded-xl text-white
  hover:bg-white/10 transition-all">
  선택됨
  <ChevronDown className="h-4 w-4" />
</button>

// 드롭다운 메뉴
<div className="absolute top-full mt-2 bg-bridge-obsidian border border-white/10
  rounded-xl shadow-xl overflow-hidden min-w-[200px]">
  <div className="py-1">
    <button className="w-full px-4 py-2 text-left text-slate-300
      hover:bg-white/5 hover:text-white transition-colors">
      옵션 1
    </button>
  </div>
</div>
```

---

## 4. 상태 표시

### 4.1 작업 부하 상태

| 상태 | 텍스트 색상 | 배경 색상 | Tailwind |
|------|------------|----------|----------|
| NORMAL (정상) | emerald-400 | emerald-500/20 | `text-emerald-400 bg-emerald-500/20` |
| OVERWORKED (과열) | red-400 | red-500/20 | `text-red-400 bg-red-500/20` |
| RELAXED (여유) | blue-400 | blue-500/20 | `text-blue-400 bg-blue-500/20` |

```tsx
// 상태 배지
<span className="px-2 py-1 text-xs font-medium rounded-full
  text-emerald-400 bg-emerald-500/20">
  정상
</span>
```

### 4.2 마일스톤 건강 상태

| 상태 | 색상 | Tailwind |
|------|------|----------|
| ON_TRACK | 초록 | `text-emerald-400 bg-emerald-500/20` |
| SLOW | 주황 | `text-amber-400 bg-amber-500/20` |
| AT_RISK | 빨강 | `text-red-400 bg-red-500/20` |
| OVERDUE | 진빨강 | `text-red-500 bg-red-600/20` |

### 4.3 가중치 레벨 색상

| 레벨 | 색상 | Tailwind |
|------|------|----------|
| Low | slate | `text-slate-400 bg-slate-500/20` |
| Medium | blue | `text-blue-400 bg-blue-500/20` |
| High | amber | `text-amber-400 bg-amber-500/20` |
| Critical | red | `text-red-400 bg-red-500/20` |

### 4.4 Task 상태 색상

| 상태 | 색상 | 조건 |
|------|------|------|
| 완료 | 초록 (`bg-emerald-500`) | completed = true |
| 마감 초과 | 빨강 (`bg-red-500`) | due_date < today & 미완료 |
| 마감 임박 | 주황 (`bg-amber-500`) | due_date = today/tomorrow |
| 진행 중 | 파랑 (`bg-blue-500`) | start_date ≤ today ≤ due_date |
| 진행 전 | 회색 (`bg-slate-500`) | start_date > today |

---

## 5. 레이아웃 패턴

### 5.1 Glass Morphism 헤더

```tsx
<header className="bg-bridge-obsidian/80 backdrop-blur-xl
  border-b border-white/5 sticky top-0 z-40">
  {/* 헤더 내용 */}
</header>
```

### 5.2 섹션 구분

```tsx
<section className="py-12 border-y border-white/5">
  {/* 섹션 내용 */}
</section>
```

### 5.3 그리드 레이아웃

```tsx
// 2열 그리드
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
  {/* 아이템 */}
</div>

// 4열 그리드
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* 아이템 */}
</div>

// 요약 카드 그리드
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  {/* 요약 카드 */}
</div>
```

### 5.4 Flex 레이아웃

```tsx
// 헤더 레이아웃
<div className="flex items-center justify-between">
  <div>{/* 왼쪽 */}</div>
  <div>{/* 오른쪽 */}</div>
</div>

// 버튼 그룹
<div className="flex items-center gap-2">
  <button>...</button>
  <button>...</button>
</div>
```

---

## 6. 애니메이션

### 6.1 Fade In Up

```tsx
// CSS 클래스
<div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
  {/* 애니메이션 적용 요소 */}
</div>

// CSS 정의 (theme.css)
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.5s ease-out forwards;
}
```

### 6.2 Framer Motion

```tsx
import { motion } from 'framer-motion';

// 기본 페이드 인
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
>
  {/* 애니메이션 요소 */}
</motion.div>

// 순차 애니메이션
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ delay: index * 0.1 }}
>
  {/* 아이템 */}
</motion.div>

// 호버 효과
<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
>
  버튼
</motion.button>
```

### 6.3 Transition 클래스

```tsx
// 기본 트랜지션
<div className="transition-all duration-200">

// 색상 트랜지션
<div className="transition-colors duration-150">

// 변환 트랜지션
<div className="transition-transform duration-300">
```

---

## 7. 아이콘

### 7.1 Lucide React

```tsx
import { Plus, Users, Settings, ChevronDown, X, Check } from 'lucide-react';

// 기본 사용
<Plus className="h-4 w-4" />

// 색상 적용
<Plus className="h-4 w-4 text-slate-400" />

// 호버 색상
<button className="text-slate-400 hover:text-white">
  <Settings className="h-5 w-5" />
</button>
```

### 7.2 자주 사용하는 아이콘

| 용도 | 아이콘 | 크기 |
|------|--------|------|
| 추가 | `Plus` | h-4 w-4 |
| 닫기 | `X` | h-5 w-5 |
| 설정 | `Settings` | h-5 w-5 |
| 사용자 | `User`, `Users` | h-4 w-4 |
| 드롭다운 | `ChevronDown` | h-4 w-4 |
| 체크 | `Check` | h-4 w-4 |
| 경고 | `AlertTriangle` | h-5 w-5 |
| 정보 | `Info` | h-4 w-4 |
| 캘린더 | `Calendar` | h-4 w-4 |
| 시간 | `Clock` | h-4 w-4 |

---

## 8. 반응형 디자인

### 8.1 브레이크포인트

| 이름 | 크기 | Tailwind |
|------|------|----------|
| sm | 640px | `sm:` |
| md | 768px | `md:` |
| lg | 1024px | `lg:` |
| xl | 1280px | `xl:` |
| 2xl | 1536px | `2xl:` |

### 8.2 반응형 패턴

```tsx
// 모바일 우선 접근
<div className="p-4 md:p-6 lg:p-8">
  <h1 className="text-2xl md:text-4xl lg:text-6xl">반응형 제목</h1>
</div>

// 그리드 반응형
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* 그리드 아이템 */}
</div>

// 숨김/표시
<div className="hidden md:block">데스크톱에서만</div>
<div className="md:hidden">모바일에서만</div>
```

---

## 9. 스크롤바 스타일

```css
/* 칸반 스크롤바 */
.kanban-scrollbar::-webkit-scrollbar {
  height: 8px;
}

.kanban-scrollbar::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.kanban-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.kanban-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
```

---

## 10. 테마 시스템

### 10.1 다크/라이트 모드

```css
/* 다크 모드 (기본) */
:root {
  --bridge-dark: #0A0E17;
  --bridge-obsidian: #0F1419;
  --text-primary: #FFFFFF;
  --text-secondary: #94A3B8;
}

/* 라이트 모드 */
:root.light {
  --bridge-dark: #F8FAFC;
  --bridge-obsidian: #FFFFFF;
  --text-primary: #0F172A;
  --text-secondary: #64748B;
}
```

### 10.2 테마 전환

```tsx
// ThemeContext 사용
const { theme, toggleTheme, isDark } = useTheme();

// 조건부 스타일
<div className={isDark ? 'bg-bridge-dark' : 'bg-white'}>
```

---

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|------|------|----------|
| v6.0 | 2026-01 | Bridge 디자인 시스템 도입 |
| v7.0 | 2026-01 | 작업 부하 상태 색상 추가 |
| v8.0 | 2026-01 | 테마 시스템, 가중치 레벨 색상 추가 |

---

**문서 버전**: 8.0
**최종 수정**: 2026년 1월 15일
