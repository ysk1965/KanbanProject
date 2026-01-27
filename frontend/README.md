
  # 팀 칸반보드 구축

  This is a code bundle for 팀 칸반보드 구축. The original project is available at https://www.figma.com/design/Lcm1TPICinoO76TiMs7e64/%ED%8C%80-%EC%B9%B8%EB%B0%98%EB%B3%B4%EB%93%9C-%EA%B5%AC%EC%B6%95.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.
  
    cd /Users/cookapps/Documents/GitHub/KanbanProject/backend

  # Gradle로 실행
  ./gradlew bootRun


  ⏺ # Java/Spring Boot 서버 죽이기
  pkill -f 'java.*kanban'

  # 또는 포트로 찾아서 죽이기 (8080 포트 기준)
  lsof -ti:8080 | xargs kill -9

  # 프론트엔드 (Vite) 죽이기
  lsof -ti:5173 | xargs kill -9