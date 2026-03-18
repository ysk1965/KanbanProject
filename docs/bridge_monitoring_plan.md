# BRIDGE Admin Monitoring System 기획서

> **Version** 1.1 | **작성일** 2025.02.13 | **최종 갱신** 2026.03.16 | **작성자** 유상건 | **문서 분류** 내부 기획서

## 현재 모니터링 현황 (2026-03-16 AWS CLI 확인)

### CloudWatch Alarms

| Alarm | State | Metric | 비고 |
|-------|-------|--------|------|
| AlarmHigh (NetworkOut) | OK | EC2 Auto Scaling 스케일업 | 정상 |
| AlarmLow (NetworkOut) | ALARM | EC2 Auto Scaling 스케일다운 | 정상 (저트래픽이므로 ALARM=스케일다운 조건 충족) |

### Free Tier 사용률

| 서비스 | 사용량 | 한도 | 사용률 | 주의 |
|--------|--------|------|--------|------|
| CloudWatch Log Ingestion | 2.33 GB | 5 GB | **47%** | 월말 ~4.5 GB (90%) 예상 |
| CloudWatch Log Storage | 0.52 GB | 5 GB | 10% | 양호 |
| CloudWatch Alarms | 1 | 10 | 10% | 양호 |
| CloudWatch Requests | 2 | 1,000,000 | <0.01% | 양호 |

> **⚠️ CloudWatch Log Ingestion 주의**: 월 5 GB 초과 시 $0.50/GB 과금. EB 로그 보존 기간(현재 30일) 단축 또는 로그 레벨 조정 검토 필요.

### 미사용 모니터링 서비스

- CloudWatch Agent: **미설치** (EC2 메모리/디스크 메트릭 수집 불가)
- SNS: 미사용 (알림 토픽 없음)
- CloudWatch Dashboard: 미생성
- X-Ray: 미사용

### 구현된 모니터링 (Backend)

- **MonitoringScheduler**: 1시간 간격 메트릭 flush, 5분 간격 체크, 매일 3am 정리
- **CloudWatch 연동**: `CLOUDWATCH_ENABLED=false` (기본 비활성화)
- **Actuator**: `/actuator/health`, `/actuator/metrics`, `/actuator/info` 노출 (details 숨김)
- **Slack Webhook**: `MONITORING_SLACK_WEBHOOK_URL` 환경변수 (선택 사항)

---

## 1. 문서 개요

### 1.1 목적

BRIDGE 서비스의 안정적인 운영을 위해 서버 모니터링 시스템을 어드민 툴 내에 구축한다. 병목 현상 조기 감지, 장애 원인 분석, 비용 최적화를 목표로 한다.

### 1.2 배경

BRIDGE는 Feature→Task→Done 계층 구조의 팀 칸반보드 SaaS로, 다음과 같은 모니터링 필수 요소가 존재한다.

- 팀 단위 사용 특성상 특정 시간대(출근 직후, 스탠드업 미팅 전후) 트래픽 집중
- 계층적 데이터 조회로 인한 DB 부하
- 외부 API(OpenAI) 의존성에 따른 비용 및 Rate Limit 관리 필요
- Trial + Subscription 결제 모델의 안정적 운영 필요

### 1.3 모니터링 대상 범위 (5개 레이어)

| # | 레이어 | 대상 |
|---|--------|------|
| ① | 인프라 | EC2, RDS, ALB 등 AWS 리소스 상태 |
| ② | 애플리케이션 | JVM, 커넥션 풀, 스레드 상태 |
| ③ | API 성능 | 응답시간, 에러율, 슬로우 쿼리 |
| ④ | 외부 API | OpenAI 사용량, 비용, Rate Limit |
| ⑤ | 비즈니스 | 팀별 사용량, 플랜별 통계, 결제 상태 |

---

## 2. 예상 병목 분석

### 2.1 병목 지점 식별

| 병목 영역 | 원인 | 증상 | 위험도 |
|-----------|------|------|--------|
| **DB 쿼리** | Feature→Task→Done 계층 JOIN, N+1 쿼리 | 칸반보드 로딩 지연, 타임라인 뷰 응답 지연 | ★★★★☆ |
| **API 응답 지연** | 초기 로딩 데이터 과다, 드래그&드롭 동시 요청 | 사용자 체감 성능 저하, 낙관적 업데이트 충돌 | ★★★☆☆ |
| **커넥션 풀** | HikariCP 풀 소진, 업무 시간 트래픽 집중 | 타임아웃 급증, DB 정상이나 앱 먹통 | ★★★☆☆ |
| **외부 API 의존** | OpenAI Rate Limit, PG사 콜백 지연 | AI 기능 장애, 결제 처리 지연 | ★★☆☆☆ |

### 2.2 병목 분석 접근법

- **DB 쿼리 병목**: Spring AOP를 통해 API별 쿼리 실행 횟수와 응답시간을 측정하고, 500ms 이상 슬로우 쿼리를 별도 로깅하여 추적
- **커넥션 풀 병목**: Spring Boot Actuator의 HikariCP 메트릭을 모니터링하여 활성/대기 커넥션 비율 추적
- **API 응답 지연**: p50, p95, p99 백분위수별 응답시간을 집계하여 이상치 탐지에 활용
- **외부 API**: 호출 성공률, 평균 응답시간, 토큰 사용량 추적

---

## 3. 수집 메트릭 정의

### 3.1 인프라 메트릭 (CloudWatch API)

> 데이터 소스: AWS CloudWatch API (5분 간격 폴링)

| 리소스 | 메트릭 | 임계치 | 알림 조건 |
|--------|--------|--------|-----------|
| EC2 | CPUUtilization, NetworkIn/Out, DiskReadOps | CPU 80% 이상 | 5분 지속 시 Slack 알림 |
| EC2 (Agent) | Memory Used %, Disk Used % | Memory 85% 이상 | 5분 지속 시 Slack 알림 |
| RDS | CPUUtilization, DatabaseConnections, FreeableMemory, ReadIOPS, WriteIOPS | CPU 70%, 커넥션 80% | 임계치 초과 시 즉시 알림 |
| ALB | RequestCount, TargetResponseTime, HTTPCode_5XX_Count | 5xx 비율 5% 이상 | 즉시 Slack 알림 |

> ⚠️ **참고**: CloudWatch Agent는 EC2 메모리 사용량 수집을 위해 별도 설치가 필요하며, 기본 CloudWatch에서는 메모리 메트릭이 제공되지 않는다.

### 3.2 애플리케이션 메트릭 (Spring Boot Actuator)

> 데이터 소스: `/actuator/metrics` 엔드포인트 (주기적 폴링)

| 영역 | 메트릭 | 목적 |
|------|--------|------|
| JVM Heap | `jvm.memory.used`, `jvm.memory.max` | OOM 예방, 메모리 누수 감지 |
| GC | `jvm.gc.pause` (count, total time) | GC 빈도 급증 시 성능 저하 감지 |
| HikariCP | `hikaricp.connections.active`, `.pending`, `.idle`, `.timeout` | 커넥션 풀 소진 감지 |
| Thread | `jvm.threads.live`, `jvm.threads.peak` | 스레드 폭발 감지 |

### 3.3 API 성능 메트릭 (자체 AOP 수집)

> 데이터 소스: Spring AOP HandlerInterceptor 기반 자체 수집

| 메트릭 | 수집 방법 | 활용 |
|--------|-----------|------|
| API별 응답시간 (p50/p95/p99) | AOP로 요청 시작/종료 시간 측정 | 느린 API 식별 및 추이 분석 |
| RPS (초당 요청 수) | 시간대별 요청 수 집계 | 트래픽 패턴 파악, 용량 계획 |
| 에러율 (4xx, 5xx) | HTTP 상태 코드별 카운트 | 장애 감지, 클라이언트 오류 파악 |
| 슬로우 쿼리 로그 | 500ms 이상 쿼리 별도 기록 | DB 병목 직접 추적 |
| 에러 트레이싱 | 에러 발생 시 스택트레이스 + 요청 파라미터 기록 | 장애 원인 추적 |

### 3.4 OpenAI API 모니터링 (Usage API)

> 데이터 소스: OpenAI Usage API + Billing API

| 메트릭 | API 엔드포인트 | 활용 |
|--------|---------------|------|
| 월간 사용 금액 ($) | `/v1/dashboard/billing/usage` | 비용 추적, 예산 초과 방지 |
| 모델별 토큰 사용량 | `/v1/usage?date={date}` | 모델 변경 판단, 비용 최적화 |
| Rate Limit 현황 | `/v1/dashboard/billing/subscription` | 티어 한도 접근 시 알림 |
| 일별 사용량 추이 | 일별 데이터 집계 | 이상 사용 감지, 프롬프트 인젝션 방지 |

> 💡 **비용 알림 설정**: 월간 하드리밋 대비 80% 도달 시 Slack 알림 발송. 특정 팀의 비정상 호출 패턴(일 평균 대비 300% 이상) 감지 시 별도 알림.

### 3.5 비즈니스 메트릭 (자체 DB)

| 메트릭 | 활용 |
|--------|------|
| 팀별 일간/주간 활성 사용량 | 고객 건강도 파악, 이탈 예측 |
| 플랜별(Trial/Basic/Pro) 사용자 수 | 전환율 추적, 가격 정책 근거 |
| 기능별 사용 빈도 | 기능 우선순위 판단 |
| 결제 상태 (성공/실패/만료) | 결제 장애 조기 감지 |

---

## 4. 어드민 대시보드 설계

### 4.1 어드민 내장 방식 선택 근거

#### 장점

- **추가 인프라 비용 없음** — Grafana+Prometheus 별도 서버 불필요 (월 2~5만원 절감)
- **비즈니스 맥락 통합** — 플랜별, 팀별 사용량과 성능 데이터를 한 화면에서 확인
- **운영 동선 통합** — 고객 문의 시 어드민에서 바로 해당 팀 로그 확인 가능
- **개발 공수 절감** — 기존 React 어드민 프론트에 페이지 추가만 필요

#### 단점 및 보완 방안

| 단점 | 영향 | 보완 방안 |
|------|------|-----------|
| 실시간 알림 불가 | 어드민을 열어봐야 확인 가능 | Slack Webhook 알림 별도 구축 |
| 시계열 데이터 저장 부하 | RDB에 메트릭 저장 시 DB 부하 증가 | 별도 메트릭 테이블 + 7일 보관 정책 |
| 전문 툴 대비 분석 한계 | Grafana 수준의 쿼리 유연성 부족 | Phase 2에서 Grafana Cloud 도입 검토 |
| 스케일 이후 한계 | 사용자 증가 시 전문 모니터링 필요 | 유료 고객 50팀+ 시점에 이관 계획 |

### 4.2 대시보드 화면 구성

| 섹션 | 표시 항목 | 차트 타입 | 갱신 주기 |
|------|-----------|-----------|-----------|
| 📡 인프라 | EC2 CPU/Mem, RDS CPU/커넥션, ALB 요청수 | Line Chart + 상태 배지 | 5분 |
| ☕ 애플리케이션 | JVM Heap, GC 빈도, HikariCP 활성/대기 | Gauge + Line Chart | 1분 |
| 🚀 API 성능 | Top 10 느린 API, 에러율, RPS 추이 | Bar + Line Chart | 1분 |
| 🤖 OpenAI | 월간 비용 게이지, 일별 토큰 추이, Rate Limit 현황 | Progress Bar + Line | 1시간 |
| 📈 비즈니스 | 팀별 사용량, 플랜별 통계, 활성 사용자 수 | Bar Chart + 수치 카드 | 1시간 |

### 4.3 OpenAI 모니터링 카드 상세

```
┌─────────────────────────────────────┐
│  💰 이번 달: $12.40 / $120 한도     │  ← 하드리밋 대비 비율
│  ████████░░░░░░░░░  10.3%          │
│                                     │
│  📊 일별 추이: [미니 차트]           │  ← 갑자기 튀면 이상 사용 감지
│                                     │
│  🔑 Rate Limit: Tier 2              │
│     RPM: 500 | TPM: 40,000         │  ← 현재 티어 한도
│                                     │
│  ⚠️ 알림: 80% 도달 시 Slack 알림    │
└─────────────────────────────────────┘
```

---

## 5. 기술 구현 설계

### 5.1 백엔드 아키텍처

#### 5.1.1 메트릭 수집 레이어

- **Spring AOP Interceptor**: API 요청/응답 시간, HTTP 상태 코드, 요청 파라미터 기록
- **Actuator 연동**: JVM, HikariCP, Thread 메트릭 주기적 폴링
- **CloudWatch Client**: AWS SDK를 통한 인프라 메트릭 조회
- **OpenAI Usage Client**: Usage API 호출을 통한 비용/토큰 조회

#### 5.1.2 데이터 저장

- **원본 메트릭**: `monitoring_metrics` 테이블, **7일 보관** 정책
- **일별 집계**: `monitoring_daily_summary` 테이블, **90일 보관**
- 매일 자정 스케줄러로 이전 데이터 자동 삭제

#### 5.1.3 알림 시스템

Slack Incoming Webhook을 통해 임계치 초과 시 실시간 알림 발송. 알림 채널은 `#bridge-monitoring` 전용 채널을 생성하여 운영한다.

| 알림 조건 | 심각도 | 알림 내용 |
|-----------|--------|-----------|
| EC2 CPU 80% 이상 5분 지속 | ⚠️ WARNING | [서버] CPU 사용률 {value}% - 확인 필요 |
| 5xx 에러율 5% 초과 | 🚨 CRITICAL | [장애] 5xx 에러율 {value}% - 즉시 확인 |
| OpenAI 비용 80% 도달 | ⚠️ WARNING | [비용] OpenAI ${used}/${limit} - 예산 확인 |
| HikariCP 활성 커넥션 90% 초과 | 🚨 CRITICAL | [커넥션] 풀 소진 임박 {active}/{max} |
| 배포 완료 시 | ℹ️ INFO | [배포] v{version} 배포 완료 - {timestamp} |

#### 5.1.4 디펜던시 헬스체크

- DB 연결, Redis(사용 시), OpenAI API, PG사 연동 상태를 주기적으로 확인
- `/actuator/health` 엔드포인트에 커스텀 HealthIndicator 등록

#### 5.1.5 배포 마커

- 배포 시점을 타임라인에 기록하여 "이 시점부터 느려졌는지" 추적 가능
- CI/CD 파이프라인에서 배포 완료 시 모니터링 API 호출

### 5.2 프론트엔드

- React 기반 어드민 앱에 모니터링 페이지 추가
- 차트 라이브러리: **Recharts**
- 자동 갱신 주기는 섹션별 차등 설정 (1분 ~ 1시간)
- 시간 범위 선택기 (최근 1시간 / 6시간 / 24시간 / 7일)

### 5.3 주요 설정 참고

**Spring Boot Actuator (application.yml)**

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, metrics, info
  endpoint:
    health:
      show-details: always
```

**CloudWatch API 호출 (Java)**

```java
GetMetricStatisticsRequest request = GetMetricStatisticsRequest.builder()
    .namespace("AWS/EC2")
    .metricName("CPUUtilization")
    .dimensions(Dimension.builder()
        .name("InstanceId")
        .value(instanceId)
        .build())
    .startTime(Instant.now().minus(Duration.ofMinutes(minutes)))
    .endTime(Instant.now())
    .period(300)
    .statistics(Statistic.AVERAGE)
    .build();
```

**OpenAI Usage API 호출 (Java)**

```java
// 사용량 조회
String url = "https://api.openai.com/v1/usage?date=" + date;

// 구독/한도 조회
String url = "https://api.openai.com/v1/dashboard/billing/subscription";
```

**CloudWatch Agent 설치 (Amazon Linux 2)**

```bash
sudo yum install amazon-cloudwatch-agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
```

---

## 6. 비용 분석

### 6.1 Phase 1 운영 비용 (어드민 내장)

| 항목 | 비용 | 비고 |
|------|------|------|
| CloudWatch API 호출 | 월 0원 | 100만 건 무료 범위 내 (5분 간격 폴링) |
| CloudWatch Agent | 월 0원 | 10개 커스텀 메트릭 무료 |
| DB 저장 공간 추가 | 월 ~0원 | 기존 RDS 용량 내 (7일 보관 정책) |
| Slack Webhook | 월 0원 | Incoming Webhook 무료 |
| **총 추가 비용** | **월 0원** | **기존 인프라 범위 내** |

### 6.2 Phase 2 예상 비용 (유료 고객 50팀+)

| 항목 | 비용 | 비고 |
|------|------|------|
| CloudWatch 세부 모니터링 | 월 $2~3/인스턴스 | 1분 간격 활성화 |
| Grafana Cloud Free Tier | 월 0원 | 메트릭 10K 시리즈까지 무료 |
| **총 추가 비용** | **월 ~$5** | **최소한의 추가 비용** |

---

## 7. 로드맵

### Phase 1: 어드민 내장 (MVP)

> **목표**: 유료 고객 50팀 이하 규모에서 안정적 운영

1. Spring Boot Actuator 설정 및 메트릭 엔드포인트 열기
2. API 응답시간 수집용 AOP Interceptor 구현
3. CloudWatch API 연동 Service 구현
4. OpenAI Usage API 연동 Service 구현
5. 메트릭 저장용 DB 테이블 설계 및 생성
6. 어드민 모니터링 대시보드 UI 구현 (React + Recharts)
7. Slack Webhook 알림 연동
8. 슬로우 쿼리 로그 뷰어 구현
9. 에러 트레이싱 (스택트레이스 + 요청 파라미터 기록)
10. 디펜던시 헬스체크 구현
11. 배포 마커 기록 기능 추가

### Phase 2: 확장 (유료 고객 50팀+ 시점)

> **목표**: 전문 모니터링 도구 도입으로 분석 능력 강화

1. CloudWatch 세부 모니터링 활성화 (1분 간격)
2. Grafana Cloud Free Tier 도입 (인프라 메트릭 분리)
3. 어드민에는 비즈니스 메트릭만 유지
4. 분산 추적 (Distributed Tracing) 검토
5. 성능 벤치마크 자동화 구축

---

## 8. 기대 효과

- **장애 대응 시간 단축**: 실시간 알림으로 장애 인지 시간을 수 시간에서 수 분 이내로 단축
- **병목 선제 대응**: DB 쿼리, 커넥션 풀 병목을 장애 발생 전 사전 감지
- **비용 최적화**: OpenAI 사용량 모니터링으로 불필요한 AI 호출 절감 및 예산 관리
- **운영 효율성**: 어드민 통합으로 별도 도구 전환 없이 운영 전반 확인 가능
- **데이터 기반 의사결정**: 팀별/플랜별 사용량 데이터로 가격 정책, 기능 우선순위 판단 근거 확보

---

## 부록

### A. 용어 정의

| 용어 | 설명 |
|------|------|
| p50 / p95 / p99 | 백분위수별 응답시간. p95는 전체 요청의 95%가 해당 시간 이내에 완료됨을 의미 |
| RPS | Requests Per Second. 초당 처리 요청 수 |
| HikariCP | Spring Boot 기본 JDBC 커넥션 풀 라이브러리 |
| Rate Limit | API 호출 횟수 제한. RPM(분당), TPM(분당 토큰) 단위로 적용 |
| GC (Garbage Collection) | JVM의 미사용 메모리 자동 해제 프로세스. 빈번할수록 성능 저하 |
| N+1 쿼리 | 1번의 쿼리로 N개 결과를 가져온 후, 각 결과에 대해 추가 쿼리가 발생하는 성능 안티패턴 |
| CloudWatch Agent | EC2 인스턴스에 설치하여 메모리, 디스크 등 기본 CloudWatch에서 제공하지 않는 메트릭을 수집하는 에이전트 |
