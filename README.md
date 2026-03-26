# Family Tree 🌳

> Visualize, build, and preserve your ancestor hierarchy — interactively.

Family Tree is a modern front-end application for mapping family trees. Build your ancestor hierarchy through an intuitive drag-and-drop canvas, store it as portable JSON, and share it across devices.

---

## Features

- **Interactive Tree Canvas** — Pan, zoom, and drag nodes on an infinite canvas powered by React Flow
- **Add People** — Create person cards with name, gender, birth/death dates, photo, and notes
- **Connect Relationships** — Draw parent-child edges between nodes to form the hierarchy
- **Auto-Layout** — Automatically arrange nodes in a clean top-down tree layout
- **Search & Filter** — Find any ancestor instantly from the sidebar
- **JSON Export / Import** — Download your entire tree as a `.json` file or load one back
- **Auto-Save** — Changes persist locally in your browser via IndexedDB — no account required
- **Responsive UI** — Works on desktop and tablet screens

---

## Tech Stack

| Category | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build Tool | Vite |
| Tree Visualization | React Flow v12 (@xyflow/react) |
| State Management | Zustand v5 |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Local Storage | Dexie.js (IndexedDB) |
| Animations | Framer Motion |
| Tree Layout | dagre |

---

## Getting Started

### Prerequisites
- Node.js >= 20 — [Download here](https://nodejs.org/)
- npm >= 10 (bundled with Node.js 20+)

Verify your versions:
```bash
node -v    # should print v20.x.x or higher
npm -v     # should print 10.x.x or higher
```

---

### Installation & Running the Dev Server

```bash
# 1. Clone the repository
git clone https://github.com/your-username/family-tree.git

# 2. Move into the project directory
cd family-tree

# 3. Install all dependencies
npm install

# 4. Start the development server
npm run dev
```

Vite will start and print something like:

```
  VITE v5.x.x  ready in 300ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
  ➜  press h + enter to show help
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser.

> **Hot Module Replacement (HMR) is active** — any file change you save will instantly reflect in the browser without a full reload.

---

### Changing the Dev Server Port

If port `5173` is already in use, either:

**Option A** — pass a different port via CLI:
```bash
npm run dev -- --port 3000
```

**Option B** — set it permanently in `vite.config.ts`:
```ts
export default defineConfig({
  server: {
    port: 3000,
  },
})
```

---

### Exposing to Your Local Network

To access the app from another device on the same Wi-Fi (e.g., tablet preview):
```bash
npm run dev -- --host
```

Vite will print a `Network:` URL you can open on any device on the same network.

---

### Build for Production

```bash
# Compile and bundle for production
npm run build

# Preview the production build locally
npm run preview
```

The production build outputs to the `dist/` folder. You can deploy this folder
to any static hosting service (Netlify, Vercel, GitHub Pages, etc.).

| Command | Purpose |
|---|---|
| `npm run dev` | Start local dev server with HMR |
| `npm run build` | Create optimised production bundle in `dist/` |
| `npm run preview` | Serve the production `dist/` build locally |
| `npm run lint` | Run ESLint across all source files |
| `npm run typecheck` | Run TypeScript compiler check (no emit) |

---

## Project Structure

```
family-tree/
├── public/                    # Static assets
├── src/
│   ├── components/
│   │   ├── TreeCanvas/        # React Flow canvas + layout logic
│   │   ├── NodeCard/          # Person node UI component
│   │   ├── PersonForm/        # Add / edit person modal
│   │   └── Sidebar/           # Search, tree info, import/export
│   ├── store/
│   │   └── treeStore.ts       # Zustand global state
│   ├── db/
│   │   └── db.ts              # Dexie IndexedDB setup
│   ├── utils/
│   │   └── treeHelpers.ts     # JSON import/export, tree utilities
│   ├── types/
│   │   └── index.ts           # TypeScript interfaces
│   ├── App.tsx
│   └── main.tsx
├── CLAUDE.md                  # AI assistant context file
├── README.md
├── package.json
├── vite.config.ts
└── tailwind.config.ts
```

---

## Data Model

The tree is stored as a single JSON object:

```json
{
  "id": "uuid",
  "name": "My Family Tree",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-03-24T00:00:00.000Z",
  "nodes": [
    {
      "id": "uuid",
      "type": "personNode",
      "position": { "x": 100, "y": 200 },
      "data": {
        "id": "uuid",
        "name": "John Doe",
        "gender": "male",
        "birthDate": "1950-06-15",
        "deathDate": null,
        "photoUrl": "",
        "notes": "Immigrated from Ireland in 1975"
      }
    }
  ],
  "edges": [
    {
      "id": "edge-uuid",
      "source": "parent-node-id",
      "target": "child-node-id",
      "type": "smoothstep"
    }
  ]
}
```

---

## Usage Guide

### Adding a Person
1. Click the **+ Add Person** button in the toolbar
2. Fill in the person's details in the form
3. Click **Save** — the node appears on the canvas

### Connecting Relatives
1. Hover over a node to reveal its connection handle
2. Drag from the handle to another node to create a parent-child relationship

### Export Your Tree
1. Open the **Sidebar**
2. Click **Export JSON** — a `.json` file downloads to your machine

### Import a Tree
1. Open the **Sidebar**
2. Click **Import JSON** and select a valid Family Tree `.json` file
3. Your tree loads instantly on the canvas

### Auto-Layout
Click the **Auto Layout** button in the toolbar to re-arrange nodes into a clean top-down hierarchy using the dagre algorithm.

---

## Roadmap

- [ ] Multiple tree support (manage several family trees)
- [ ] Spouse / partner relationships
- [ ] Photo upload with local object URL storage
- [ ] Timeline view per person
- [ ] PDF / PNG export of the canvas
- [ ] Cloud sync via Supabase
- [ ] Collaborative editing (real-time)
- [ ] Dark mode

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

Please follow the existing code conventions described in [CLAUDE.md](./CLAUDE.md).

---

## Resume this session with:                                                                                                                                                                                                                         
claude --resume 33fd089e-5c12-4154-8f46-18980e359225

---

## License

MIT — see [LICENSE](./LICENSE) for details.

---

<p align="center">Built with React Flow, Zustand, and Tailwind CSS</p>
