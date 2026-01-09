# ============================================
# Team Kanban Board - CI/CD Pipeline
# ============================================

name: Deploy

on:
  push:
    branches:
      - main      # Production
      - staging   # Staging
      - develop   # Development
  pull_request:
    branches:
      - main
      - staging

env:
  AWS_REGION: ap-northeast-2

# 동시 배포 방지
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ============================================
  # 환경 결정
  # ============================================
  setup:
    runs-on: ubuntu-latest
    outputs:
      environment: ${{ steps.set-env.outputs.environment }}
      should_deploy: ${{ steps.set-env.outputs.should_deploy }}
    steps:
      - name: Set environment
        id: set-env
        run: |
          if [[ "${{ github.ref }}" == "refs/heads/main" ]]; then
            echo "environment=prod" >> $GITHUB_OUTPUT
            echo "should_deploy=true" >> $GITHUB_OUTPUT
          elif [[ "${{ github.ref }}" == "refs/heads/staging" ]]; then
            echo "environment=staging" >> $GITHUB_OUTPUT
            echo "should_deploy=true" >> $GITHUB_OUTPUT
          elif [[ "${{ github.ref }}" == "refs/heads/develop" ]]; then
            echo "environment=dev" >> $GITHUB_OUTPUT
            echo "should_deploy=true" >> $GITHUB_OUTPUT
          else
            echo "environment=dev" >> $GITHUB_OUTPUT
            echo "should_deploy=false" >> $GITHUB_OUTPUT
          fi

  # ============================================
  # Backend 테스트
  # ============================================
  test-backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: kanban_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run type check
        run: npm run typecheck
      
      - name: Run tests
        run: npm test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/kanban_test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test-secret

  # ============================================
  # Frontend 테스트
  # ============================================
  test-frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run type check
        run: npm run typecheck
      
      - name: Run tests
        run: npm test -- --passWithNoTests
      
      - name: Build
        run: npm run build

  # ============================================
  # Backend 배포
  # ============================================
  deploy-backend:
    needs: [setup, test-backend]
    if: needs.setup.outputs.should_deploy == 'true'
    runs-on: ubuntu-latest
    environment: ${{ needs.setup.outputs.environment }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Login to Amazon ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2
      
      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          ECR_REPOSITORY: kanban-backend
          IMAGE_TAG: ${{ github.sha }}
          ENV: ${{ needs.setup.outputs.environment }}
        run: |
          docker build \
            --build-arg NODE_ENV=production \
            -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG \
            -t $ECR_REGISTRY/$ECR_REPOSITORY:$ENV-latest \
            ./backend
          
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$ENV-latest
      
      - name: Update ECS task definition
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: backend/task-definition-${{ needs.setup.outputs.environment }}.json
          container-name: backend
          image: ${{ steps.ecr-login.outputs.registry }}/kanban-backend:${{ github.sha }}
      
      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: backend
          cluster: kanban-${{ needs.setup.outputs.environment }}
          wait-for-service-stability: true
      
      - name: Notify Slack
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: "Backend deployed to ${{ needs.setup.outputs.environment }}"
          fields: repo,message,commit,author,action,eventName,ref
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}

  # ============================================
  # Frontend 배포
  # ============================================
  deploy-frontend:
    needs: [setup, test-frontend]
    if: needs.setup.outputs.should_deploy == 'true'
    runs-on: ubuntu-latest
    environment: ${{ needs.setup.outputs.environment }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        working-directory: frontend
        run: npm ci
      
      - name: Build
        working-directory: frontend
        run: npm run build
        env:
          VITE_API_URL: ${{ vars.API_URL }}
          VITE_ENV: ${{ needs.setup.outputs.environment }}
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Deploy to S3
        run: |
          aws s3 sync frontend/dist s3://kanban-frontend-${{ needs.setup.outputs.environment }} \
            --delete \
            --cache-control "public, max-age=31536000, immutable" \
            --exclude "index.html" \
            --exclude "*.json"
          
          # index.html은 캐시하지 않음
          aws s3 cp frontend/dist/index.html s3://kanban-frontend-${{ needs.setup.outputs.environment }}/index.html \
            --cache-control "no-cache, no-store, must-revalidate"
      
      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ vars.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
      
      - name: Notify Slack
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: "Frontend deployed to ${{ needs.setup.outputs.environment }}"
          fields: repo,message,commit,author,action,eventName,ref
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}

  # ============================================
  # DB 마이그레이션
  # ============================================
  run-migrations:
    needs: [setup, deploy-backend]
    if: needs.setup.outputs.should_deploy == 'true'
    runs-on: ubuntu-latest
    environment: ${{ needs.setup.outputs.environment }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Run migrations via ECS task
        run: |
          aws ecs run-task \
            --cluster kanban-${{ needs.setup.outputs.environment }} \
            --task-definition kanban-migration-${{ needs.setup.outputs.environment }} \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[${{ vars.PRIVATE_SUBNET_IDS }}],securityGroups=[${{ vars.ECS_SECURITY_GROUP_ID }}],assignPublicIp=DISABLED}"

  # ============================================
  # Production 배포 승인
  # ============================================
  approve-prod:
    needs: [setup, deploy-backend, deploy-frontend]
    if: needs.setup.outputs.environment == 'staging'
    runs-on: ubuntu-latest
    environment: 
      name: production-approval
    
    steps:
      - name: Approval gate
        run: echo "Production deployment approved"

  # ============================================
  # Terraform (인프라 변경 시)
  # ============================================
  terraform:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    defaults:
      run:
        working-directory: infrastructure/terraform/environments/${{ needs.setup.outputs.environment || 'dev' }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.6.0
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Terraform Init
        run: terraform init
      
      - name: Terraform Format Check
        run: terraform fmt -check
      
      - name: Terraform Plan
        id: plan
        run: terraform plan -no-color
        continue-on-error: true
      
      - name: Comment PR with Plan
        uses: actions/github-script@v7
        if: github.event_name == 'pull_request'
        with:
          script: |
            const output = `#### Terraform Plan 📖
            
            \`\`\`
            ${{ steps.plan.outputs.stdout }}
            \`\`\`
            
            *Pushed by: @${{ github.actor }}, Action: \`${{ github.event_name }}\`*`;
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: output
            })