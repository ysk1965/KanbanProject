# Kanban Project - Root AGENTS.md

## Project Overview

Kanban Board 프로젝트 - Board, Feature, Task, Schedule 기반 프로젝트 관리 시스템

### Architecture

- **Frontend**: React SPA (Vite + TypeScript)
- **Backend**: Spring Boot REST API (Java 21)

## Operational Commands

```bash
# Frontend
cd frontend && npm run dev      # Development
cd frontend && npm run build    # Production build

# Backend
cd backend && ./gradlew bootRun # Development
cd backend && ./gradlew test    # Run tests
```

## Golden Rules

### Immutable

- FE-BE 통신은 snake_case JSON 사용
- JWT 기반 인증 (access_token, refresh_token)
- API 버전: /api/v1

### Do's

- 작업 전 해당 영역의 AGENTS.md 확인
- 기존 패턴과 컨벤션 준수
- FE: shadcn/ui 컴포넌트 사용
- BE: Lombok + JPA 패턴 사용

### Don'ts

- 새로운 HTTP 클라이언트 구현 금지 (FE: apiClient 사용)
- Entity 직접 노출 금지 (BE: DTO 사용)
- 하드코딩된 시크릿 금지

## Context Map (Action-Based Routing)

- **[Frontend 작업 (React/TypeScript)](./frontend/AGENTS.md)** - UI 컴포넌트, 페이지, API 연동 작업 시
- **[Backend 작업 (Spring Boot)](./backend/AGENTS.md)** - REST API, 도메인 로직, 인증 작업 시

## Work Protocol

1. 작업 영역 식별 (FE or BE)
2. 해당 AGENTS.md 참조
3. 기존 코드 패턴 확인
4. 규칙에 맞게 구현

## Maintenance Policy

규칙과 실제 코드가 달라지면 AGENTS.md 업데이트 제안
