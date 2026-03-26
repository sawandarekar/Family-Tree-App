import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'

/* ── Types ───────────────────────────────────────────── */
interface PersonData {
  id: string
  name: string
  birth: string
  children?: PersonData[]
  spouses?: PersonData[]     // adjacent partner nodes (multiple allowed)
}

interface LayoutNode {
  data: PersonData
  x: number
  y: number
  depth: number
  isSpouse?: boolean         // rendered adjacent, not in hierarchy
}

interface LayoutLink {
  source: LayoutNode
  target: LayoutNode
}

/* ── Constants ───────────────────────────────────────── */
const NODE_W  = 130
const NODE_H  = 46
const PAD_Y   = 40

/* ── Initial tree data ───────────────────────────────── */
const INITIAL_DATA: PersonData = {
  id: '1', name: 'John Doe', birth: 'b. 1920',
  children: [
    {
      id: '2', name: 'Mary Doe', birth: 'b. 1948',
      children: [
        { id: '4', name: 'Anna Doe',  birth: 'b. 1972', children: [] },
        { id: '5', name: 'Peter Doe', birth: 'b. 1975', children: [] },
      ],
    },
    {
      id: '3', name: 'James Doe', birth: 'b. 1951',
      children: [
        { id: '6', name: 'Claire Doe', birth: 'b. 1978', children: [] },
        { id: '7', name: 'Robert Doe', birth: 'b. 1980', children: [] },
      ],
    },
  ],
}

/* ── Helpers ─────────────────────────────────────────── */
function flattenTree(node: PersonData): PersonData[] {
  return [node, ...(node.spouses ?? []), ...(node.children ?? []).flatMap(flattenTree)]
}

function insertNode(root: PersonData, parentId: string, newNode: PersonData): PersonData {
  if (root.id === parentId)
    return { ...root, children: [...(root.children ?? []), newNode] }
  return { ...root, children: (root.children ?? []).map(c => insertNode(c, parentId, newNode)) }
}

// Insert newNode as the parent of targetId.
// If targetId is the current root, newNode becomes the new root with old root as its child.
// Otherwise newNode is inserted between targetId and its current parent.
function addAsParent(root: PersonData, targetId: string, newNode: PersonData): PersonData {
  if (root.id === targetId) return { ...newNode, children: [root] }
  const children = root.children ?? []
  const idx = children.findIndex(c => c.id === targetId)
  if (idx !== -1) {
    const wrapped = { ...newNode, children: [children[idx]] }
    return { ...root, children: children.map((c, i) => i === idx ? wrapped : c) }
  }
  return { ...root, children: children.map(c => addAsParent(c, targetId, newNode)) }
}

function deleteNode(root: PersonData, id: string): PersonData | null {
  if (root.id === id) return null
  // Remove from spouses array if the deleted node is a spouse
  const withoutSpouse: PersonData = root.spouses?.some(s => s.id === id)
    ? { ...root, spouses: root.spouses!.filter(s => s.id !== id) }
    : root
  return {
    ...withoutSpouse,
    children: (withoutSpouse.children ?? [])
      .map(c => deleteNode(c, id))
      .filter((c): c is PersonData => c !== null),
  }
}

function addSpouseToNode(root: PersonData, targetId: string, spouse: PersonData): PersonData {
  if (root.id === targetId) return { ...root, spouses: [...(root.spouses ?? []), spouse] }
  return { ...root, children: (root.children ?? []).map(c => addSpouseToNode(c, targetId, spouse)) }
}

function findNode(root: PersonData, id: string): PersonData | null {
  if (root.id === id) return root
  for (const c of root.children ?? []) { const r = findNode(c, id); if (r) return r }
  return null
}

function subtreeIds(node: PersonData): Set<string> {
  const ids = new Set<string>()
  const walk = (n: PersonData) => { ids.add(n.id); (n.children ?? []).forEach(walk) }
  walk(node)
  return ids
}

// Detach nodeId from its current parent and re-attach under newParentId.
function moveNode(root: PersonData, nodeId: string, newParentId: string): PersonData {
  const node = findNode(root, nodeId)!
  const without = deleteNode(root, nodeId)!
  return insertNode(without, newParentId, node)
}

function nodeColour(depth: number) {
  if (depth === 0) return { fill: '#1b3324', stroke: '#f0c040', sw: 2,   text: '#f0c040' }
  if (depth === 1) return { fill: '#132318', stroke: '#3ddd82', sw: 1.8, text: '#3ddd82' }
  return               { fill: '#0f1f14', stroke: '#3a6e52', sw: 1.2, text: '#b8d4c0' }
}

/* ── D3 layout hook ──────────────────────────────────── */
function useTreeLayout(data: PersonData) {
  return useMemo(() => {
    const root = d3.hierarchy<PersonData>(data)
    d3.tree<PersonData>().nodeSize([NODE_W + 24, NODE_H + 72])(root)

    const descs = root.descendants() as (d3.HierarchyNode<PersonData> & { x: number; y: number })[]
    const xs    = descs.map(d => d.x)
    const ox    = -Math.min(...xs) + 20

    const hierarchyNodes: LayoutNode[] = descs.map(d => ({
      data: d.data,
      x: d.x + ox,
      y: d.y + PAD_Y,
      depth: d.depth,
    }))

    const nodeMap = new Map(hierarchyNodes.map(n => [n.data.id, n]))
    const links: LayoutLink[] = root.links().map(l => ({
      source: nodeMap.get(l.source.data.id)!,
      target: nodeMap.get(l.target.data.id)!,
    }))

    // child → parent lookup for ancestor-path highlighting
    const parentMap = new Map<string, string>()
    root.links().forEach(l => parentMap.set(l.target.data.id, l.source.data.id))

    // Spouse nodes: alternate left/right of partner (idx 0 → right, idx 1 → left, idx 2 → right …)
    // Multiple on the same side stack vertically
    const spouseNodes: LayoutNode[] = []
    const spouseEdges: Array<{ partner: LayoutNode; spouse: LayoutNode; side: 'left' | 'right' }> = []
    for (const n of hierarchyNodes) {
      (n.data.spouses ?? []).forEach((sp, idx) => {
        const side  = idx % 2 === 0 ? 'right' : 'left'
        const stack = Math.floor(idx / 2)           // how many already on this side
        const sx    = side === 'right'
          ? n.x + NODE_W + 32
          : n.x - NODE_W - 32
        const sn: LayoutNode = {
          data: sp,
          x: sx,
          y: n.y + stack * (NODE_H + 16),
          depth: n.depth,
          isSpouse: true,
        }
        spouseNodes.push(sn)
        spouseEdges.push({ partner: n, spouse: sn, side })
      })
    }

    return { nodes: [...hierarchyNodes, ...spouseNodes], links, spouseEdges, parentMap }
  }, [data])
}

/* ── Cubic bezier path between two nodes ─────────────── */
function edgePath(s: LayoutNode, t: LayoutNode) {
  const x1 = s.x + NODE_W / 2,  y1 = s.y + NODE_H
  const x2 = t.x + NODE_W / 2,  y2 = t.y
  const my = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
}

/* ── Zoom control button ─────────────────────────────── */
function ZoomBtn({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: '36px', height: '36px',
        background: '#132318',
        border: '1px solid #254535',
        borderRadius: '8px',
        color: '#b8d4c0',
        fontSize: label === '⊡' ? '1rem' : '1.3rem',
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1,
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#3ddd82'
        ;(e.currentTarget as HTMLButtonElement).style.background = '#1b3324'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#254535'
        ;(e.currentTarget as HTMLButtonElement).style.background = '#132318'
      }}
    >
      {label}
    </button>
  )
}

/* ── Tree Canvas ─────────────────────────────────────── */
function TreeCanvas({ data, onDelete, onMove }: {
  data: PersonData
  onDelete: (id: string) => void
  onMove: (nodeId: string, newParentId: string) => void
}) {
  const svgRef  = useRef<SVGSVGElement>(null)
  const gRef    = useRef<SVGGElement>(null)
  const ghostRef = useRef<SVGGElement>(null)
  const zoomRef   = useRef<d3.ZoomBehavior<SVGSVGElement, unknown>>()
  const draggingIdRef = useRef<string | null>(null)

  const [panning,     setPanning]     = useState(false)
  const [hoveredId,   setHoveredId]   = useState<string | null>(null)
  const [draggingId,  setDraggingId]  = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  // IDs that cannot be a drop target while dragging (self + descendants)
  const invalidDropIds = useMemo(() => {
    if (!draggingId) return new Set<string>()
    const n = findNode(data, draggingId)
    return n ? subtreeIds(n) : new Set<string>()
  }, [draggingId, data])

  const { nodes, links, spouseEdges, parentMap } = useTreeLayout(data)

  // Walk up the parentMap to collect all node IDs on the path from hoveredId → root
  const ancestorPath = useMemo(() => {
    if (!hoveredId) return new Set<string>()
    const path = new Set<string>()
    let cur: string | undefined = hoveredId
    while (cur) { path.add(cur); cur = parentMap.get(cur) }
    return path
  }, [hoveredId, parentMap])

  /* Fit transform — centres + scales tree to fill SVG */
  const fitView = useCallback((animate = true) => {
    if (!svgRef.current || !zoomRef.current || nodes.length === 0) return
    const el = svgRef.current
    const W  = el.clientWidth  || 800
    const H  = el.clientHeight || 400

    const xs = nodes.map(n => n.x)
    const ys = nodes.map(n => n.y)
    const x0 = Math.min(...xs) - 24
    const y0 = Math.min(...ys) - 24
    const x1 = Math.max(...xs) + NODE_W + 24
    const y1 = Math.max(...ys) + NODE_H + 24

    const scale = Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.9
    const tx    = W / 2 - scale * ((x0 + x1) / 2)
    const ty    = H / 2 - scale * ((y0 + y1) / 2)

    const sel = d3.select(el)
    if (animate) sel.transition().duration(450).call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
    else         sel.call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
  }, [nodes])

  /* Set up D3 zoom once */
  useEffect(() => {
    if (!svgRef.current) return
    const svg  = d3.select(svgRef.current)
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      // Don't start pan/zoom when the pointer is on a draggable node
      .filter((event: Event) => {
        if (event.type === 'mousedown') {
          const t = event.target as Element
          return !t.closest('[data-node]')
        }
        return !( event as MouseEvent).button
      })
      .on('zoom', ({ transform }) => {
        if (gRef.current) gRef.current.setAttribute('transform', transform.toString())
      })
    svg.call(zoom)
    zoomRef.current = zoom
    return () => { svg.on('.zoom', null) }
  }, [])

  /* Re-fit whenever tree data changes */
  useEffect(() => { fitView(false) }, [fitView])

  const zoomIn  = () => svgRef.current && zoomRef.current &&
    d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, 1.4)

  const zoomOut = () => svgRef.current && zoomRef.current &&
    d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, 1 / 1.4)

  /* ── Drag helpers ── */
  function svgPoint(clientX: number, clientY: number) {
    const b = svgRef.current!.getBoundingClientRect()
    return { sx: clientX - b.left, sy: clientY - b.top }
  }

  function dataPoint(clientX: number, clientY: number) {
    const { sx, sy } = svgPoint(clientX, clientY)
    const [dx, dy] = d3.zoomTransform(svgRef.current!).invert([sx, sy])
    return { dx, dy }
  }

  function nodeAt(clientX: number, clientY: number): LayoutNode | null {
    const { dx, dy } = dataPoint(clientX, clientY)
    return nodes.find(n =>
      dx >= n.x && dx <= n.x + NODE_W && dy >= n.y && dy <= n.y + NODE_H
    ) ?? null
  }

  function moveGhost(clientX: number, clientY: number) {
    if (!ghostRef.current || !svgRef.current) return
    const { sx, sy } = svgPoint(clientX, clientY)
    ghostRef.current.setAttribute('transform',
      `translate(${sx - NODE_W / 2}, ${sy - NODE_H / 2})`)
  }

  function startDrag(e: React.MouseEvent, nodeId: string) {
    draggingIdRef.current = nodeId
    setDraggingId(nodeId)
    setHoveredId(null)
    moveGhost(e.clientX, e.clientY)
  }

  function onSvgMouseMove(e: React.MouseEvent) {
    if (!draggingIdRef.current) { setPanning(e.buttons === 1); return }
    moveGhost(e.clientX, e.clientY)
    const target = nodeAt(e.clientX, e.clientY)
    const tid = target?.data.id ?? null
    setDropTargetId(tid && !invalidDropIds.has(tid) ? tid : null)
  }

  function onSvgMouseUp(e: React.MouseEvent) {
    setPanning(false)
    const dragId = draggingIdRef.current
    if (!dragId) return
    draggingIdRef.current = null
    setDraggingId(null)
    setDropTargetId(null)
    const target = nodeAt(e.clientX, e.clientY)
    if (target && !invalidDropIds.has(target.data.id)) {
      onMove(dragId, target.data.id)
    }
  }

  function onSvgMouseLeave() {
    setPanning(false)
    if (draggingIdRef.current) {
      draggingIdRef.current = null
      setDraggingId(null)
      setDropTargetId(null)
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>

      {/* SVG canvas — D3 zoom/pan attached here */}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ display: 'block', cursor: draggingId ? 'grabbing' : panning ? 'grabbing' : 'grab' }}
        onMouseDown={() => !draggingId && setPanning(true)}
        onMouseMove={onSvgMouseMove}
        onMouseUp={onSvgMouseUp}
        onMouseLeave={onSvgMouseLeave}
      >
        <g ref={gRef}>

          {/* Hierarchy edges */}
          {links.map((lk, i) => {
            const onPath = ancestorPath.has(lk.source.data.id) && ancestorPath.has(lk.target.data.id)
            return (
              <path
                key={i}
                d={edgePath(lk.source, lk.target)}
                fill="none"
                stroke={onPath ? '#f0c040' : lk.source.depth === 0 ? '#3ddd82' : '#3a6e52'}
                strokeWidth={onPath ? 2.2 : lk.source.depth === 0 ? 1.8 : 1.3}
              />
            )
          })}

          {/* Spouse edges — dotted pink line from partner edge to each wife */}
          {spouseEdges.map((se, i) => {
            const isRight = se.side === 'right'
            // partner connection point
            const x1 = isRight ? se.partner.x + NODE_W : se.partner.x
            const y1 = se.partner.y + NODE_H / 2
            // spouse connection point (opposite edge)
            const x2 = isRight ? se.spouse.x : se.spouse.x + NODE_W
            const y2 = se.spouse.y + NODE_H / 2
            return (
              <g key={`spouse-${i}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#ff69b4" strokeWidth={1.5} strokeDasharray="4,4" />
              </g>
            )
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const col          = nodeColour(node.depth)
            const isSmall      = node.depth >= 2
            const canDelete    = node.depth > 0 || node.isSpouse === true
            const canDrag      = node.depth > 0 && !node.isSpouse
            const isHovered    = hoveredId === node.data.id
            const isDragging   = draggingId === node.data.id
            const isDropTarget = dropTargetId === node.data.id
            // trash icon position — top-left of node
            const ix = node.x + 5
            const iy = node.y + 5
            return (
              <g
                key={node.data.id}
                data-node={canDrag ? 'true' : undefined}
                onMouseEnter={() => { if (!draggingId) setHoveredId(node.data.id) }}
                onMouseLeave={() => setHoveredId(null)}
                onMouseDown={canDrag ? e => startDrag(e, node.data.id) : undefined}
                onTouchStart={() => canDelete && setHoveredId(node.data.id)}
                onTouchEnd={() => setHoveredId(null)}
                style={{ cursor: canDrag ? 'grab' : 'default', opacity: isDragging ? 0.3 : 1 }}
              >
                <rect
                  x={node.x} y={node.y}
                  width={NODE_W} height={NODE_H}
                  rx={10}
                  fill={col.fill}
                  stroke={isDropTarget ? '#3ddd82' : isHovered ? '#f0c040' : col.stroke}
                  strokeWidth={isDropTarget ? 2.5 : col.sw}
                  strokeDasharray={isDropTarget ? '5,3' : undefined}
                />
                <text
                  x={node.x + NODE_W / 2}
                  y={node.y + NODE_H / 2 - (node.data.birth && !isSmall ? 7 : 0)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={col.text}
                  fontSize={isSmall ? 10 : 11}
                  fontWeight={600}
                  fontFamily="'Segoe UI', sans-serif"
                >
                  {node.data.name}
                </text>
                {node.data.birth && !isSmall && (
                  <text
                    x={node.x + NODE_W / 2}
                    y={node.y + NODE_H / 2 + 9}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#7da88a"
                    fontSize={9}
                    fontFamily="'Segoe UI', sans-serif"
                  >
                    {node.data.birth}
                  </text>
                )}
                {/* Trash icon — visible only on hover/touch */}
                {canDelete && isHovered && (
                  <g
                    style={{ cursor: 'pointer' }}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onDelete(node.data.id) }}
                  >
                    {/* invisible hit area */}
                    <rect x={ix - 2} y={iy - 2} width={16} height={15} fill="transparent" />
                    {/* trash can drawn at (ix, iy), scaled down */}
                    <g transform={`translate(${ix}, ${iy}) scale(0.65)`} style={{ pointerEvents: 'none' }}>
                      {/* handle */}
                      <rect x="4.5" y="0" width="7" height="2.2" rx="1" fill="none" stroke="#9ca3af" strokeWidth="1.3" />
                      {/* lid */}
                      <rect x="0" y="2.2" width="16" height="2.5" rx="1" fill="none" stroke="#9ca3af" strokeWidth="1.3" />
                      {/* body */}
                      <path d="M 2 5.5 L 2.8 16 L 13.2 16 L 14 5.5 Z" fill="none" stroke="#9ca3af" strokeWidth="1.3" strokeLinejoin="round" />
                      {/* inner lines */}
                      <line x1="5.5" y1="7.5" x2="5.2" y2="14" stroke="#9ca3af" strokeWidth="1.1" strokeLinecap="round" />
                      <line x1="8"   y1="7.5" x2="8"   y2="14" stroke="#9ca3af" strokeWidth="1.1" strokeLinecap="round" />
                      <line x1="10.5" y1="7.5" x2="10.8" y2="14" stroke="#9ca3af" strokeWidth="1.1" strokeLinecap="round" />
                    </g>
                  </g>
                )}
              </g>
            )
          })}

        </g>

        {/* Ghost node — follows cursor during drag, rendered in screen space */}
        {draggingId && (() => {
          const dn = nodes.find(n => n.data.id === draggingId)
          if (!dn) return null
          const col = nodeColour(dn.depth)
          return (
            <g ref={ghostRef} style={{ pointerEvents: 'none' }} opacity={0.82}>
              <rect width={NODE_W} height={NODE_H} rx={10}
                fill={col.fill} stroke="#f0c040" strokeWidth={2} strokeDasharray="5,3" />
              <text x={NODE_W / 2} y={NODE_H / 2 - (dn.data.birth ? 7 : 0)}
                textAnchor="middle" dominantBaseline="middle"
                fill={col.text} fontSize={11} fontWeight={600} fontFamily="'Segoe UI', sans-serif">
                {dn.data.name}
              </text>
              {dn.data.birth && (
                <text x={NODE_W / 2} y={NODE_H / 2 + 9}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="#7da88a" fontSize={9} fontFamily="'Segoe UI', sans-serif">
                  {dn.data.birth}
                </text>
              )}
            </g>
          )
        })()}
      </svg>

      {/* ── Zoom controls — bottom right ── */}
      <div style={{
        position: 'absolute',
        bottom: '1.25rem',
        right: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        zIndex: 10,
      }}>
        <ZoomBtn label="+"  title="Zoom in"   onClick={zoomIn} />
        <ZoomBtn label="⊡"  title="Fit view"  onClick={() => fitView(true)} />
        <ZoomBtn label="−"  title="Zoom out"  onClick={zoomOut} />
      </div>

    </div>
  )
}

/* ── Styles ──────────────────────────────────────────── */
const S = {
  page: {
    display: 'flex', flexDirection: 'column' as const,
    height: '100vh', background: 'var(--bg-base)', color: 'var(--tx-primary)',
  },
  nav: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.85rem 2rem',
    background: 'var(--bg-nav)', borderBottom: '1px solid var(--bd-default)',
    flexShrink: 0,
  },
  navLogo: { fontSize: '1.2rem', fontWeight: 800, color: 'var(--ac-green)', letterSpacing: '-0.5px' },
  navRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  navMeta: { fontSize: '0.82rem', color: 'var(--tx-muted)' },
  backBtn: {
    background: 'transparent', border: '1px solid var(--bd-default)',
    color: 'var(--tx-body)', padding: '0.4rem 1rem', borderRadius: '8px',
    fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
  },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: {
    width: '240px', flexShrink: 0,
    background: 'var(--bg-surface)', borderRight: '1px solid var(--bd-default)',
    display: 'flex', flexDirection: 'column' as const,
    padding: '2.5rem 1.25rem 1.25rem', gap: '1.2rem', overflow: 'hidden' as const,
  },
  sidebarLabel: {
    fontSize: '0.7rem', textTransform: 'uppercase' as const,
    letterSpacing: '2px', color: 'var(--tx-muted)', fontWeight: 700, marginBottom: '0.4rem',
  },
  btn: {
    width: '100%', padding: '0.6rem 1rem', borderRadius: '8px',
    fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
    border: '1px solid var(--bd-default)', background: 'var(--bg-raised)',
    color: 'var(--tx-body)', textAlign: 'left' as const, marginBottom: '0.45rem',
  },
  btnPrimary: { background: 'var(--ac-green)', color: '#0b1a10', border: 'none' },
  personCard: {
    padding: '0.55rem 0.75rem', borderRadius: '8px',
    background: 'var(--bg-raised)', border: '1px solid var(--bd-default)', marginBottom: '0.4rem',
  },
  personName: { color: 'var(--tx-primary)', fontWeight: 600, fontSize: '0.88rem' },
  personMeta: { color: 'var(--tx-muted)', fontSize: '0.78rem' },
  canvasArea: { flex: 1, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    padding: '0.7rem 1.25rem',
    background: 'var(--bg-surface)', borderBottom: '1px solid var(--bd-default)', flexShrink: 0,
  },
  toolbarHint: { fontSize: '0.78rem', color: 'var(--tx-muted)', marginLeft: 'auto' },
  canvas: { flex: 1, overflow: 'hidden', background: 'var(--bg-base)', position: 'relative' as const },
  footer: {
    padding: '0.75rem 2rem',
    background: 'var(--bg-nav)', borderTop: '1px solid var(--bd-default)',
    display: 'flex', justifyContent: 'space-between',
    fontSize: '0.78rem', color: 'var(--tx-muted)', flexShrink: 0,
  },
  overlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.72)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
  },
  modal: {
    background: 'var(--bg-surface)', border: '1px solid var(--bd-default)',
    borderRadius: '16px', padding: '2rem', width: '360px',
    display: 'flex', flexDirection: 'column' as const, gap: '1rem',
  },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--tx-primary)' },
  fieldLabel: {
    display: 'block', fontSize: '0.8rem', color: 'var(--tx-muted)',
    fontWeight: 600, marginBottom: '0.3rem',
  },
  input: {
    width: '100%', padding: '0.55rem 0.85rem',
    background: 'var(--bg-raised)', border: '1px solid var(--bd-default)',
    borderRadius: '8px', color: 'var(--tx-primary)',
    fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit',
  },
  modalActions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.25rem' },
  toolbarBtn: {
    padding: '0.38rem 0.85rem', borderRadius: '7px', fontSize: '0.82rem',
    cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
    border: '1px solid var(--bd-default)', background: 'var(--bg-raised)', color: 'var(--tx-body)',
  },
}

/* ── App ─────────────────────────────────────────────── */
export default function App() {
  const [treeData,   setTreeData]   = useState<PersonData | null>(INITIAL_DATA)
  const [showAdd,    setShowAdd]    = useState(false)
  const [form,       setForm]       = useState({ name: '', birth: '', relatedId: '', relation: 'child' as 'child' | 'parent' | 'spouse' })
  const [showSave,   setShowSave]   = useState(false)
  const [saveName,   setSaveName]   = useState('')
  const [savedNames, setSavedNames] = useState<Set<string>>(new Set())

  // Load existing saved names from server on mount
  useEffect(() => {
    fetch('/api/trees')
      .then(r => r.json())
      .then((names: string[]) => setSavedNames(new Set(names)))
      .catch(() => {/* server not running — silently ignore */})
  }, [])
  const importRef = useRef<HTMLInputElement>(null)

  const allPeople = useMemo(() => treeData ? flattenTree(treeData) : [], [treeData])

  function addPerson() {
    if (!form.name.trim()) return
    const node: PersonData = { id: Date.now().toString(), name: form.name.trim(), birth: form.birth.trim(), children: [] }
    if (!treeData) {
      setTreeData(node)
    } else {
      const relatedId = form.relatedId || treeData.id
      if (form.relation === 'parent') {
        setTreeData(prev => addAsParent(prev!, relatedId, node))
      } else if (form.relation === 'spouse') {
        setTreeData(prev => addSpouseToNode(prev!, relatedId, node))
      } else {
        setTreeData(prev => insertNode(prev!, relatedId, node))
      }
    }
    setForm({ name: '', birth: '', relatedId: '', relation: 'child' })
    setShowAdd(false)
  }

  function startNewTree() {
    if (treeData && !window.confirm('This will clear the current tree. Continue?')) return
    setTreeData(null)
  }

  function openSaveDialog() {
    setSaveName('')
    setShowSave(true)
  }

  async function confirmSave() {
    const name = saveName.trim()
    if (!name || !treeData) return

    const body = JSON.stringify(treeData)
    const headers = { 'Content-Type': 'application/json' }

    // Try POST first; if 409 (exists) ask to overwrite then PUT
    let res = await fetch(`/api/trees/${encodeURIComponent(name)}`, { method: 'POST', headers, body })

    if (res.status === 409) {
      if (!window.confirm(`"${name}" is already saved on the server. Overwrite?`)) return
      res = await fetch(`/api/trees/${encodeURIComponent(name)}`, { method: 'PUT', headers, body })
    }

    if (!res.ok) {
      alert('Save failed. Make sure the server is running (`npm run server`).')
      return
    }

    setSavedNames(prev => new Set(prev).add(name))
    setShowSave(false)
  }

  function exportTree() {
    if (!treeData) return
    const blob = new Blob([JSON.stringify(treeData, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'family-tree.json' })
    a.click()
    URL.revokeObjectURL(url)
  }

  function importTree(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as PersonData
        if (!parsed.id || !parsed.name) throw new Error('Invalid tree format')
        setTreeData(parsed)
      } catch {
        alert('Invalid JSON file. Please export a valid Family Tree file first.')
      } finally {
        // reset input so the same file can be re-imported if needed
        if (importRef.current) importRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  return (
    <div style={S.page}>

      {/* Nav */}
      <nav style={S.nav}>
        <span style={S.navLogo}>🌳 Family Tree</span>
        <div style={S.navRight}>
          <span style={S.navMeta}>{treeData ? `${allPeople.length} people · D3 tree layout` : 'Empty tree'}</span>
          <button style={S.backBtn} onClick={() => window.location.reload()}>← Back to Home</button>
        </div>
      </nav>

      <div style={S.body}>

        {/* Sidebar */}
        <aside style={S.sidebar}>
          <div>
            <p style={S.sidebarLabel}>Actions</p>
            <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setShowAdd(true)}>+ Add Person</button>
            <button style={S.btn} onClick={exportTree} disabled={!treeData}>↓ Export JSON</button>
            <button style={{ ...S.btn, color: treeData ? 'var(--ac-teal)' : 'var(--tx-muted)' }} onClick={openSaveDialog} disabled={!treeData}>💾 Save JSON</button>
            <button style={S.btn} onClick={() => importRef.current?.click()}>↑ Import JSON</button>
            <button style={{ ...S.btn, color: 'var(--tx-muted)' }} onClick={startNewTree}>⊘ Start New Tree</button>
            <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importTree} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' as const, minHeight: 0 }}>
            <p style={S.sidebarLabel}>People ({allPeople.length})</p>
            {allPeople.map(p => (
              <div key={p.id} style={S.personCard}>
                <div style={S.personName}>{p.name}</div>
                {p.birth && <div style={S.personMeta}>{p.birth}</div>}
              </div>
            ))}
          </div>
        </aside>

        {/* Canvas area */}
        <div style={S.canvasArea}>
          <div style={S.toolbar}>
            <span style={{ fontSize: '0.82rem', color: 'var(--tx-muted)', marginRight: '0.25rem' }}>Canvas</span>
            <span style={{
              fontSize: '0.72rem', background: 'var(--ac-green-dim)', color: 'var(--ac-green)',
              padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.5px',
            }}>D3</span>
            <span style={S.toolbarHint}>
              Scroll to zoom · Drag to pan · Use controls bottom-right
            </span>
          </div>

          <div style={S.canvas}>
            {treeData ? (
              <TreeCanvas
                data={treeData}
                onDelete={id => {
                  const updated = deleteNode(treeData, id)
                  if (updated) setTreeData(updated)
                }}
                onMove={(nodeId, newParentId) => {
                  const dragged = findNode(treeData, nodeId)
                  if (!dragged) return
                  if (subtreeIds(dragged).has(newParentId)) return // guard: no drop on descendant
                  setTreeData(moveNode(treeData, nodeId, newParentId))
                }}
              />
            ) : (
              <div style={{
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '1rem',
              }}>
                <span style={{ fontSize: '3rem', opacity: 0.25 }}>🌳</span>
                <p style={{ color: 'var(--tx-muted)', fontSize: '0.92rem' }}>No tree yet.</p>
                <button style={{ ...S.toolbarBtn, ...S.btnPrimary, padding: '0.6rem 1.4rem' }}
                  onClick={() => setShowAdd(true)}>
                  + Add First Person
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Footer */}
      <footer style={S.footer}>
        <span>Family Tree © 2026</span>
        <span>Powered by D3.js hierarchy layout · React 19</span>
      </footer>

      {/* Add Person Modal */}
      {showAdd && (
        <div style={S.overlay} onClick={() => setShowAdd(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <p style={S.modalTitle}>Add Person</p>
            <div>
              <label style={S.fieldLabel}>Full Name *</label>
              <input style={S.input} placeholder="e.g. Jane Doe" value={form.name} autoFocus
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={S.fieldLabel}>Birth Year</label>
              <input style={S.input} placeholder="e.g. b. 1990" value={form.birth}
                onChange={e => setForm(f => ({ ...f, birth: e.target.value }))} />
            </div>
            {treeData && (<>
              <div>
                <label style={S.fieldLabel}>Relationship</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['child', 'parent', 'spouse'] as const).map(rel => (
                    <button
                      key={rel}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, relation: rel }))}
                      style={{
                        flex: 1, padding: '0.45rem 0', borderRadius: '7px', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600,
                        border: `1px solid ${form.relation === rel ? 'var(--ac-green)' : 'var(--bd-default)'}`,
                        background: form.relation === rel ? 'var(--ac-green-dim)' : 'var(--bg-raised)',
                        color: form.relation === rel ? 'var(--ac-green)' : 'var(--tx-muted)',
                      }}
                    >
                      {rel === 'child' ? '↓ Child of' : rel === 'parent' ? '↑ Parent of' : '♥ Wife of'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={S.fieldLabel}>
                  {form.relation === 'child' ? 'Parent' : form.relation === 'parent' ? 'Child' : 'Wife of'}
                </label>
                <select style={{ ...S.input, cursor: 'pointer' }}
                  value={form.relatedId || treeData.id}
                  onChange={e => setForm(f => ({ ...f, relatedId: e.target.value }))}>
                  {allPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </>)}
            <div style={S.modalActions}>
              <button style={{ ...S.toolbarBtn, padding: '0.55rem 1.2rem' }} onClick={() => setShowAdd(false)}>Cancel</button>
              <button style={{ ...S.toolbarBtn, ...S.btnPrimary, padding: '0.55rem 1.4rem', border: 'none' }} onClick={addPerson}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Save JSON Modal */}
      {showSave && (
        <div style={S.overlay} onClick={() => setShowSave(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <p style={S.modalTitle}>Save Family Tree</p>
            <div>
              <label style={S.fieldLabel}>Family Name</label>
              <input
                style={{
                  ...S.input,
                  borderColor: saveName.trim() && savedNames.has(saveName.trim()) ? '#f0c040' : 'var(--bd-default)',
                }}
                placeholder="e.g. Doe Family"
                value={saveName}
                autoFocus
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmSave()}
              />
              {saveName.trim() && savedNames.has(saveName.trim()) && (
                <p style={{ fontSize: '0.78rem', color: '#f0c040', marginTop: '0.4rem' }}>
                  ⚠ "{saveName.trim()}" was already saved — saving will overwrite it.
                </p>
              )}
            </div>
            <div style={S.modalActions}>
              <button style={{ ...S.toolbarBtn, padding: '0.55rem 1.2rem' }} onClick={() => setShowSave(false)}>Cancel</button>
              <button
                style={{ ...S.toolbarBtn, ...S.btnPrimary, padding: '0.55rem 1.4rem', border: 'none', opacity: saveName.trim() ? 1 : 0.5 }}
                disabled={!saveName.trim()}
                onClick={confirmSave}
              >Save</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
