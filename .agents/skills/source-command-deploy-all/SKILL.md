---
name: "source-command-deploy-all"
description: "Migrated source command `deploy_all`"
---

# source-command-deploy-all

Use this skill when the user asks to run the migrated source command `deploy_all`.

## Command Template

현재 브랜치를 `develop`에 반영해서 Backend + Frontend를 모두 배포합니다.

## 배포 구조 (참고)

- 이 저장소는 모노레포(`ysk1965/KanbanProject`)이며, `backend/`(Elastic Beanstalk)와 `frontend/`(S3 + CloudFront)를 함께 담고 있다.
- **`develop` 브랜치에 push되면** `.github/workflows/ci.yml`(CI)가 돌고, 성공 시 `deploy-dev.yml`(Deploy)이 자동 실행되어 **변경된 경로(BE/FE)를 감지해 배포**한다.
- 즉, "배포"는 곧 **현재 작업물을 `develop`에 올리는 것**이다.

## 실행 순서

### 1. 사전 확인
- `git rev-parse --abbrev-ref HEAD`로 현재 브랜치 확인 (원래 브랜치 이름 기억해두기)
- `git status`로 변경사항 확인
- `gh auth status`로 GitHub CLI 로그인 상태 확인 (안 되어 있으면 중단하고 알려줘)

### 2. 현재 브랜치 커밋 & push
- 변경사항이 있으면:
  - 변경 내용 분석해서 커밋 메시지 작성 (한글, conventional commit: feat/fix/refactor/docs/style/chore)
  - `git add .` → `git commit`
- 현재 브랜치를 origin에 push (`git push`, upstream 없으면 `-u origin <현재브랜치>`)

### 3. develop에 반영
- 이미 `develop` 브랜치라면 이 단계 건너뛰고 push만으로 배포가 트리거됨
- 다른 브랜치라면:
  - `git checkout develop` → `git pull origin develop`
  - `git merge <원래브랜치>` 실행
    - **머지 충돌이 나면 즉시 중단**하고, `git merge --abort` 후 사용자에게 충돌 사실과 파일 목록을 알려줘 (임의 해결 금지)
  - 충돌 없이 머지되면 `git push origin develop` → 이 push가 CI → Deploy를 자동 트리거
  - `git checkout <원래브랜치>`로 원래 브랜치 복귀

### 4. 배포 모니터링
- push 직후 CI가 잡히도록 잠시 대기 후 실행:
  - `gh run list --branch develop --limit 5` 로 방금 트리거된 CI/Deploy run 확인
  - 최신 run의 상태를 `gh run watch <run-id>` 또는 주기적 `gh run list`로 추적
- 배포는 CI(빌드/테스트) → Deploy(BE Elastic Beanstalk + FE S3/CloudFront) 순으로 진행되어 수 분 소요됨
- Deploy 워크플로우는 변경 경로를 감지해 **BE만/FE만/둘 다** 자동 선택함 (모노레포 diff 기반)

### 5. 완료 보고
- BE / FE 각각의 배포 결과(성공/실패/스킵) 요약
- 실패 시 실패한 job과 `gh run view <run-id> --log-failed` 로그 요약 제공
- 성공 시 배포 대상 도메인 안내: `bridgespots.com`, `milkyway.pe.kr`

## 주의사항

- `develop` push는 **실제 개발 환경(dev) 배포를 발생**시키므로, 3단계 push 직전에 "무엇을(브랜치/커밋) develop에 반영해 배포합니다"를 사용자에게 한 줄로 확인시켜줘.
- 강제 push(`--force`) 금지. develop 히스토리를 다시 쓰지 말 것.
- AWS 리소스는 계정 `259151461692`(profile `burgermonster`, region `ap-northeast-2`)에 있으며, 배포 자체는 GHA OIDC 역할로 수행되므로 로컬 AWS 자격증명은 필요 없다.
