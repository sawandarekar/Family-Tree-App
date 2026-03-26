import { list, put } from '@vercel/blob'

function safeName(raw) {
  return raw?.replace(/[^a-zA-Z0-9 _-]/g, '').trim()
}

export default async function handler(req, res) {
  // GET /api/trees — list all saved family names
  if (req.method === 'GET') {
    const { blobs } = await list({ prefix: 'trees/' })
    const names = blobs.map(b => b.pathname.replace('trees/', '').replace('.json', ''))
    return res.status(200).json(names)
  }

  // POST /api/trees — save a new tree (name in body)
  if (req.method === 'POST') {
    const { name, tree } = req.body
    const safe = safeName(name)
    if (!safe) return res.status(400).json({ error: 'Invalid name' })

    // Check if already exists
    const { blobs } = await list({ prefix: `trees/${safe}.json` })
    if (blobs.length > 0) {
      return res.status(409).json({ error: 'exists', name: safe })
    }

    await put(`trees/${safe}.json`, JSON.stringify(tree, null, 2), {
      access: 'public',
      contentType: 'application/json',
    })
    return res.status(200).json({ ok: true, name: safe })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
