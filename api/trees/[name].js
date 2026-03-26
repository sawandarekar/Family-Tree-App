import { put } from '@vercel/blob'

function safeName(raw) {
  return raw?.replace(/[^a-zA-Z0-9 _-]/g, '').trim()
}

// PUT /api/trees/:name — overwrite an existing tree
export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const safe = safeName(req.query.name)
  if (!safe) return res.status(400).json({ error: 'Invalid name' })

  await put(`trees/${safe}.json`, JSON.stringify(req.body, null, 2), {
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: true,
  })

  res.status(200).json({ ok: true, name: safe })
}
