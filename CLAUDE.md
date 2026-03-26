# Familty Tree — Claude Code Context

## Project Overview
**Familty Tree** is a front-end web application for maintaining ancestor/family hierarchies. It renders an interactive tree structure in the UI and persists the tree as JSON (locally via IndexedDB, optionally synced to the cloud).

## Tech Stack
| Layer | Library/Tool | Version Target |
|---|---|---|
| Framework | React + TypeScript | React 19 |
| Build Tool | Vite | Latest |
| Tree Canvas | @xyflow/react (React Flow) | v12 |
| State Management | Zustand | v5 |
| Styling | Tailwind CSS + shadcn/ui | Tailwind v4 |
| Local Storage | Dexie.js (IndexedDB) | v4 |
| Animations | Framer Motion | v11 |
| Cloud (optional) | Supabase | Latest |

## Project Structure
```
Familty-Tree-App/
├── public/
├── src/
│   ├── components/
│   │   ├── TreeCanvas/        # React Flow canvas, node rendering
│   │   ├── NodeCard/          # Individual person node UI
│   │   ├── PersonForm/        # Add / edit person modal/form
│   │   └── Sidebar/           # Tree info, search, settings panel
│   ├── store/
│   │   └── treeStore.ts       # Zustand global tree state
│   ├── db/
│   │   └── db.ts              # Dexie IndexedDB schema & queries
│   ├── utils/
│   │   └── treeHelpers.ts     # JSON import/export, tree traversal
│   ├── types/
│   │   └── index.ts           # Shared TypeScript interfaces
│   ├── App.tsx
│   └── main.tsx
├── CLAUDE.md
├── README.md
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

## Core Data Model
```typescript
// Person node stored in the tree
interface Person {
  id: string;           // uuid
  name: string;
  gender: 'male' | 'female' | 'other';
  birthDate?: string;   // ISO date string
  deathDate?: string;
  photoUrl?: string;
  notes?: string;
}

// Tree node for React Flow
interface TreeNode {
  id: string;
  type: 'personNode';
  position: { x: number; y: number };
  data: Person;
}

// Tree edge (parent → child relationship)
interface TreeEdge {
  id: string;
  source: string;       // parent node id
  target: string;       // child node id
  type: 'smoothstep';
}

// Full tree snapshot (persisted as JSON)
interface FamilyTree {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodes: TreeNode[];
  edges: TreeEdge[];
}
```

## Key Features
- **Interactive tree canvas** — pan, zoom, drag nodes (React Flow)
- **Add / edit / delete** person nodes with a form modal
- **Parent-child edges** — connect nodes to form the hierarchy
- **JSON export/import** — download or upload the full tree as `.json`
- **Local persistence** — tree auto-saves to IndexedDB via Dexie
- **Search/filter** — find person by name in the sidebar
- **Responsive layout** — sidebar collapses on small screens

## Development Commands
```bash
npm install          # install dependencies
npm run dev          # start dev server (Vite)
npm run build        # production build
npm run preview      # preview production build
npm run lint         # ESLint check
npm run typecheck    # TypeScript type check
```

## Coding Conventions
- All components in `PascalCase` folders with an `index.tsx` entry
- Zustand store slices separated by concern (tree, UI, settings)
- No prop drilling — use Zustand for shared state
- shadcn/ui components for all interactive UI elements (buttons, modals, inputs)
- Tailwind utility classes only — no separate CSS files unless unavoidable
- `treeHelpers.ts` is pure functions only (no side effects, easy to test)
- Always type React Flow nodes/edges with the generic `Node<Person>` pattern

## Persistence Strategy
- Primary: **IndexedDB** via Dexie — stores `FamilyTree` objects locally
- Export: Native `Blob` + `URL.createObjectURL` to download `.json`
- Import: `FileReader` API to parse uploaded `.json` and hydrate the store
- Cloud sync (future): Supabase table mirroring the `FamilyTree` schema

## React Flow Notes
- Use `<ReactFlowProvider>` at the app root
- Custom node type registered as `nodeTypes = { personNode: PersonNode }`
- Edges use `type: 'smoothstep'` for clean curved lines
- `onConnect` callback updates both Zustand store and Dexie
- Layout algorithm: dagre (top-down hierarchy) via `dagre` npm package

## Dos and Don'ts
- **Do** keep React Flow node data normalized in Zustand
- **Do** debounce auto-save writes to IndexedDB (300ms)
- **Do** validate JSON shape on import before hydrating store
- **Don't** store base64 images in IndexedDB — use object URLs or external links
- **Don't** use `useEffect` for derived state — use Zustand selectors
- **Don't** mutate node/edge arrays directly — always spread or use immer
