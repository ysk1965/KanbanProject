# Frontend AGENTS.md

## Project Context

Kanban Board Frontend - React SPA for project management with boards, features, tasks, and scheduling.

### Tech Stack

- React 18.3.1 + TypeScript 5.5
- Vite 6.3.5 (build tool)
- Tailwind CSS 4.1.12
- Radix UI + shadcn/ui components
- React Router DOM 7
- React Hook Form
- motion (Framer Motion)
- date-fns, recharts

### Operational Commands

```bash
# Development
npm run dev

# Production Build
npm run build
```

## Project Structure

```
src/
  main.tsx              # Entry point
  app/
    App.tsx             # Router & AuthProvider
    types/              # TypeScript interfaces
    contexts/           # React Context (Auth, Drag)
    constants/          # App constants
    utils/
      api.ts            # API client & endpoints
      services.ts       # Business logic services
    components/
      ui/               # shadcn/ui primitives
      figma/            # Custom Figma components
    pages/              # Page components
    lib/                # Utility functions
  styles/               # Global CSS
```

## Golden Rules

### Immutable

- All API responses use snake_case (matches BE Jackson config)
- JWT tokens stored in localStorage (access_token, refresh_token)
- API base URL from VITE_API_BASE_URL env variable

### Do's

- Use shadcn/ui components from `./app/components/ui/`
- Use `apiClient` from `./app/utils/api.ts` for all HTTP requests
- Use `useAuth()` hook for authentication state
- Use TypeScript interfaces for all API responses
- Follow existing snake_case naming for API response types
- Use Tailwind CSS for styling (no inline styles)
- Use React Router DOM for navigation

### Don'ts

- Do not create new HTTP client implementations
- Do not store sensitive data outside localStorage tokens
- Do not use axios (project uses native fetch via apiClient)
- Do not modify shadcn/ui primitives directly
- Do not use class components (functional only)

## API Integration

### Authentication Flow

```typescript
// Login/Signup stores tokens automatically
await authAPI.login({ email, password });

// apiClient auto-attaches Bearer token
await apiClient.get('/boards');

// Token refresh handled automatically on 401
```

### Response Type Convention

All API types are defined in `./app/utils/api.ts` with snake_case:

```typescript
interface BoardListItem {
  id: string;
  name: string;
  is_starred: boolean;  // snake_case from BE
  member_count: number;
}
```

## Component Patterns

### Page Component

```typescript
// pages/ExamplePage.tsx
export function ExamplePage() {
  const [data, setData] = useState<DataType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return <MainContent data={data} />;
}
```

### Protected Route

```typescript
<PrivateRoute>
  <ProtectedPage />
</PrivateRoute>
```

## Context Map

- **[UI Components](./src/app/components/ui/AGENTS.md)** - shadcn/ui primitives usage
- **[API Layer](./src/app/utils/AGENTS.md)** - API client and service patterns
- **[State Management](./src/app/contexts/AGENTS.md)** - Context providers and hooks

## Testing Strategy

No test framework configured. Manual testing via browser dev tools.

## Maintenance Policy

Update this document when:
- New major dependencies are added
- API response formats change
- New architectural patterns are introduced
