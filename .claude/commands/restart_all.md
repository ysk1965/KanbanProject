프론트엔드와 백엔드 서버를 모두 재시작해줘.

1. 포트 5173 (프론트엔드)과 8080 (백엔드) 프로세스를 종료
2. 다음 두 작업을 병렬로 실행:
   - /Users/cookapps/Documents/GitHub/KanbanProject/backend 에서 ./gradlew bootRun을 백그라운드로 실행
   - /Users/cookapps/Documents/GitHub/KanbanProject_FE/frontend 에서 npm run dev를 백그라운드로 실행
3. 서버 시작 상태 확인
