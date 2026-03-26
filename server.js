import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR   = path.join(__dirname, 'data')
const app        = express()

app.use(express.json({ limit: '10mb' }))

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR)

// Sanitise family name — only letters, numbers, spaces, hyphens, underscores
function safeName(raw) {
  return raw?.replace(/[^a-zA-Z0-9 _-]/g, '').trim()
}

// GET /api/trees — list all saved family names
app.get('/api/trees', (_req, res) => {
  const names = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.slice(0, -5))
  res.json(names)
})

// POST /api/trees/:name — save new tree (fails with 409 if name already taken)
app.post('/api/trees/:name', (req, res) => {
  const name = safeName(req.params.name)
  if (!name) return res.status(400).json({ error: 'Invalid name' })

  const file = path.join(DATA_DIR, `${name}.json`)
  if (fs.existsSync(file)) {
    return res.status(409).json({ error: 'exists', name })
  }

  fs.writeFileSync(file, JSON.stringify(req.body, null, 2), 'utf8')
  res.json({ ok: true, name })
})

// PUT /api/trees/:name — overwrite existing tree
app.put('/api/trees/:name', (req, res) => {
  const name = safeName(req.params.name)
  if (!name) return res.status(400).json({ error: 'Invalid name' })

  const file = path.join(DATA_DIR, `${name}.json`)
  fs.writeFileSync(file, JSON.stringify(req.body, null, 2), 'utf8')
  res.json({ ok: true, name })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Family Tree API → http://localhost:${PORT}`))
