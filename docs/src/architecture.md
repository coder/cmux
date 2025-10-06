# Architecture

cmux is built with a clear separation between the main process (backend) and renderer process (frontend).

## High-Level Architecture

```mermaid
graph TB
    Frontend[React Frontend<br/>src/App.tsx]
    IPC[IPC Layer<br/>src/preload.ts]
    Backend[Electron Main<br/>src/main.ts]
    Services[Services Layer]
    FS[File System<br/>~/.cmux/]
    
    Frontend <-->|IPC Channels| IPC
    IPC <-->|Typed API| Backend
    Backend --> Services
    Services --> FS
    
    style Frontend fill:#61dafb
    style Backend fill:#47848f
    style Services fill:#68a063
```

## Key Components

### Frontend (Renderer Process)

- **React UI** - Built with TypeScript and React
- **State Management** - React hooks and context
- **IPC Client** - Type-safe API calls via preload script

### Backend (Main Process)

- **Electron Main** - Window management and lifecycle
- **Services** - Business logic (WorkspaceService, HistoryService, etc.)
- **Configuration** - JSON-based config management

### IPC Layer

Provides type-safe communication between frontend and backend:

```typescript
window.api.workspace.create(projectPath, branchName)
window.api.history.get(workspaceId)
```

## Data Flow

```mermaid
sequenceDiagram
    participant UI as React UI
    participant IPC as IPC Layer
    participant Main as Main Process
    participant FS as File System
    
    UI->>IPC: workspace.create()
    IPC->>Main: invoke via channels
    Main->>FS: Create worktree
    FS-->>Main: Success
    Main-->>IPC: WorkspaceMetadata
    IPC-->>UI: Update state
```

## Project Structure

- `src/main.ts` - Main Electron process
- `src/preload.ts` - Preload script for IPC
- `src/App.tsx` - Main React component
- `src/config.ts` - Configuration management
- `~/.cmux/` - User data directory
  - `config.json` - User configuration
  - `src/<project>/<branch>/` - Git worktrees
  - `sessions/<workspace_id>/chat.jsonl` - Chat history
