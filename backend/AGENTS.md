# Backend AGENTS.md

## Project Context

Kanban Board Backend - Spring Boot REST API for project management with authentication, boards, features, tasks, and scheduling.

### Tech Stack

- Java 21
- Spring Boot 3.4.1
- Spring Security + JWT (jjwt 0.12.6)
- Spring Data JPA
- PostgreSQL (production) / H2 (development)
- Lombok
- Google OAuth2 Client

### Operational Commands

```bash
# Development (with Gradle Wrapper)
./gradlew bootRun

# Build
./gradlew build

# Test
./gradlew test

# Clean Build
./gradlew clean build
```

## Project Structure

```
src/main/java/com/kanban/
  KanbanApplication.java          # Main entry point
  domain/
    auth/                         # Authentication (login, signup, OAuth)
      controller/
      service/
      dto/
    board/                        # Board management
      controller/
      service/
      dto/
      Board.java, BoardMember.java, Role.java
    member/                       # Member management
      controller/
      service/
      dto/
    schedule/                     # Daily schedule blocks
      controller/
      service/
      dto/
      ScheduleBlock.java
    activity/                     # Activity logs
      controller/
      service/
      dto/
    user/                         # User entity
    test/                         # Test data generation

src/main/resources/
  templates/                      # Thymeleaf email templates
  application.properties          # Configuration
```

## Golden Rules

### Immutable

- All REST responses use snake_case (Jackson configuration)
- JWT tokens required for all endpoints except `/api/v1/auth/**`
- API versioning: `/api/v1/**`

### Do's

- Use Lombok annotations (@Data, @Builder, @RequiredArgsConstructor)
- Use Spring Data JPA repositories for data access
- Use DTO pattern for request/response objects
- Use @Valid for request validation
- Use ResponseEntity for HTTP responses
- Follow domain-driven package structure (domain/feature/layer)

### Don'ts

- Do not expose entity objects directly in responses
- Do not hardcode secrets (use application.properties or env)
- Do not bypass Spring Security for authentication
- Do not use raw SQL unless JPA is insufficient
- Do not create circular dependencies between domains

## Authentication

### JWT Flow

```java
// Login returns tokens
POST /api/v1/auth/login
Response: { access_token, refresh_token, user }

// Protected endpoints require Bearer token
Authorization: Bearer <access_token>

// Refresh token endpoint
POST /api/v1/auth/refresh
Body: { refresh_token }
```

### Security Configuration

- Public endpoints: `/api/v1/auth/**`, `/api/v1/invites/{code}`, `/api/v1/pricing`
- All other endpoints require authentication
- Google OAuth supported via `/api/v1/auth/google`

## Domain Patterns

### Controller

```java
@RestController
@RequestMapping("/api/v1/boards/{boardId}/features")
@RequiredArgsConstructor
public class FeatureController {
    private final FeatureService featureService;

    @GetMapping
    public ResponseEntity<FeaturesResponse> getFeatures(
        @PathVariable String boardId
    ) {
        return ResponseEntity.ok(featureService.getFeatures(boardId));
    }
}
```

### Service

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FeatureService {
    private final FeatureRepository featureRepository;

    @Transactional
    public FeatureResponse create(String boardId, CreateFeatureRequest request) {
        // Business logic
    }
}
```

### DTO

```java
// Request DTO
public record CreateFeatureRequest(
    @NotBlank String title,
    String description,
    String color
) {}

// Response DTO (snake_case via Jackson)
@Data @Builder
public class FeatureResponse {
    private String id;
    private String title;
    private String featureColor;  // -> feature_color in JSON
}
```

## API Response Format

### Success Response

```json
{
  "id": "uuid",
  "name": "Board Name",
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Error Response

```json
{
  "code": "B001",
  "message": "Board not found",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Context Map

- **[Auth Domain](./src/main/java/com/kanban/domain/auth/AGENTS.md)** - Authentication and authorization
- **[Board Domain](./src/main/java/com/kanban/domain/board/AGENTS.md)** - Board, member, and role management
- **[Schedule Domain](./src/main/java/com/kanban/domain/schedule/AGENTS.md)** - Daily schedule blocks

## Testing Strategy

```bash
# Run all tests
./gradlew test

# Run specific test class
./gradlew test --tests "ClassName"
```

- Use @SpringBootTest for integration tests
- Use @WebMvcTest for controller tests
- Use @DataJpaTest for repository tests
- Mock external dependencies with @MockBean

## Database

### JPA Naming

- Entity tables: snake_case (e.g., board_member)
- Use @Table(name = "table_name") for explicit naming
- Use UUID for primary keys

### Relationships

```java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "board_id")
private Board board;

@OneToMany(mappedBy = "board", cascade = CascadeType.ALL)
private List<BoardMember> members;
```

## Maintenance Policy

Update this document when:
- New domains are added
- Authentication flow changes
- API versioning updates
- Major dependency upgrades
