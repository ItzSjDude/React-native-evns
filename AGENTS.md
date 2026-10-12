# Project Agent Instructions

## Feature Development and Refactoring Workflow

Apply these rules whenever implementing a new feature, extending an existing architecture, or refactoring core code.

### Architecture

- Keep feature-specific components, state logic, API queries, and types inside `src/features/<feature-name>/`.
- Put shared UI components and atomic components in top-level shared component locations such as `src/components/`.
- Put infrastructure, storage, API clients, and other cross-cutting code in `src/core/` or `src/services/`.
- Keep shared infrastructure independent from feature logic.

### Contracts First

- Define TypeScript domain models, API response shapes, and state interfaces before implementing components, handlers, or services.
- Keep contracts explicit and aligned with actual API behavior.

### State Management

- Treat API data as server state and use the project's query/cache solution where available.
- Keep Redux or local state focused on UI state such as flags, modal visibility, active inputs, and selections.
- Do not copy raw API responses into global UI state.

### Public Interfaces and Imports

- Expose each feature's public components, hooks, and types through `src/features/<feature-name>/index.ts`.
- Import features through their public barrel exports rather than internal paths.
- Do not use deep imports into another feature's internal directories.
- If multiple features need the same component or utility, move it into an appropriate shared location.
- Check for circular dependencies before completing the change.

### Validation

- Inspect the architecture before writing implementation code.
- Run the relevant type checking, linting, tests, and production build commands after changes.
- Confirm that imports respect feature boundaries and that public exports are intentional.
