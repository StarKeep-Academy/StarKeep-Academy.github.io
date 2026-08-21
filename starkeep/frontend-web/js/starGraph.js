/**
 * Star graph — constellation structure and derived layout.
 *
 * A constellation's structure is a DAG. `edges` is an array of
 * `{ from: starId, to: starId }` and is the ONLY source of sequence truth;
 * connector lines and star positions are both DERIVED from it. Nothing
 * downstream authors either directly.
 *
 * Previously "sequence" was implied by two things that silently drifted
 * apart — `flatStarsArray` push order and the connector-line chain — which is
 * what let split stars pile up on top of each other. See DEC-013.
 *
 * DELIBERATELY THREE-FREE. `frontend-web` has no bundler and no node_modules
 * (three comes from a CDN import map), so a module that imports three cannot
 * be executed under Node — only syntax-checked. Keeping this file dependency-
 * free means the graph and layout maths, which is where the real correctness
 * risk lives, can be unit-tested for real. Positions are plain
 * `{ x, y, z }` objects; the view converts to THREE.Vector3 at the boundary.
 */

/* ── Graph primitives ─────────────────────────────────────────────────── */

/** Adjacency in both directions. */
export function buildAdjacency(edges) {
    const out = new Map();
    const inc = new Map();
    edges.forEach(({ from, to }) => {
        if (!out.has(from)) out.set(from, []);
        if (!inc.has(to)) inc.set(to, []);
        out.get(from).push(to);
        inc.get(to).push(from);
    });
    return { out, inc };
}

/** Nodes with no incoming edge — where the sequence starts. */
export function graphRoots(edges, nodeIds) {
    const hasIncoming = new Set(edges.map(e => e.to));
    return nodeIds.filter(id => !hasIncoming.has(id));
}

/** Nodes with no outgoing edge — where the sequence ends. */
export function graphTails(edges, nodeIds) {
    const hasOutgoing = new Set(edges.map(e => e.from));
    return nodeIds.filter(id => !hasOutgoing.has(id));
}

/** Every node reachable from `startIds`, never entering `blocked`. */
export function reachableFrom(adjacency, startIds, blocked = new Set()) {
    const seen = new Set();
    const queue = [];
    startIds.forEach((id) => {
        if (blocked.has(id) || seen.has(id)) return;
        seen.add(id);
        queue.push(id);
    });
    while (queue.length) {
        const id = queue.shift();
        (adjacency.get(id) || []).forEach((next) => {
            if (seen.has(next) || blocked.has(next)) return;
            seen.add(next);
            queue.push(next);
        });
    }
    return seen;
}

/**
 * Longest-path layering (Kahn's algorithm). Rank is "sequence depth" — roots
 * are 0, and every node ranks strictly deeper than all of its predecessors,
 * so ranks read as order of work. Longest path rather than shortest, so a
 * node waits for its slowest prerequisite instead of floating forward past
 * work it depends on.
 *
 * Nodes left over after Kahn's (i.e. inside a cycle — shouldn't happen, since
 * every edge addition is cycle-guarded) keep rank 0 rather than being dropped,
 * so a corrupt graph still lays out instead of vanishing.
 */
export function topoRank(edges, nodeIds) {
    const { out, inc } = buildAdjacency(edges);
    const rank = new Map();
    const indegree = new Map();
    nodeIds.forEach((id) => {
        indegree.set(id, (inc.get(id) || []).filter(p => nodeIds.includes(p)).length);
        rank.set(id, 0);
    });

    const queue = nodeIds.filter(id => indegree.get(id) === 0);
    let processed = 0;
    while (queue.length) {
        const id = queue.shift();
        processed++;
        (out.get(id) || []).forEach((next) => {
            if (!rank.has(next)) return;
            rank.set(next, Math.max(rank.get(next), rank.get(id) + 1));
            indegree.set(next, indegree.get(next) - 1);
            if (indegree.get(next) === 0) queue.push(next);
        });
    }

    if (processed !== nodeIds.length) {
        console.warn('[starGraph] topoRank: cycle detected; unranked nodes pinned to 0');
    }
    return rank;
}

/**
 * The set of nodes that move when `rootId` is dragged: `rootId` plus every
 * descendant whose ONLY route from the graph's roots runs through it.
 *
 * This is what makes "grab a star and its branches come with it" correct in a
 * DAG. A branch that dead-ends is exclusively owned by `rootId` and travels
 * with it. A branch that merges back into the trunk has a second parent, so
 * it is still reachable without passing through `rootId` — and correctly
 * stays put.
 */
export function dominatedSet(edges, rootId, nodeIds) {
    const { out } = buildAdjacency(edges);
    const descendants = reachableFrom(out, out.get(rootId) || []);
    if (descendants.size === 0) return new Set([rootId]);

    // What is still reachable if `rootId` is cut out of the graph? Anything
    // that survives has an independent route and must not be dragged along.
    const starts = graphRoots(edges, nodeIds).filter(id => id !== rootId);
    const survivesWithout = reachableFrom(out, starts, new Set([rootId]));

    const dominated = new Set([rootId]);
    descendants.forEach((id) => {
        if (!survivesWithout.has(id)) dominated.add(id);
    });
    return dominated;
}

/**
 * What actually travels with a star when it is dragged.
 *
 * `dominatedSet` alone is too greedy for reordering: in a plain chain
 * a→b→c→d every later star is dominated by every earlier one, so grabbing c
 * would drag d along and reordering within a sequence would be impossible.
 *
 * A star that simply sits in the chain (at most one outgoing link) therefore
 * moves alone — its neighbours are rejoined behind it. A star that FORKS
 * (two or more outgoing links) is the head of a real branch, so its whole
 * exclusively-owned subtree comes with it. That is the "grab a root star and
 * its branches come too" behaviour, and because it is built on dominance, a
 * branch that rejoins the trunk further down still correctly stays put.
 */
export function dragMoveSet(edges, starId, nodeIds) {
    const { out } = buildAdjacency(edges);
    const outgoing = (out.get(starId) || []).length;
    if (outgoing < 2) return new Set([starId]);
    return dominatedSet(edges, starId, nodeIds);
}

/**
 * Would adding `from → to` close a loop? True if `to` already reaches `from`,
 * or if they're the same node. Every edge addition is guarded by this — rank
 * and layout both assume acyclicity.
 */
export function wouldCreateCycle(edges, from, to) {
    if (from === to) return true;
    const { out } = buildAdjacency(edges);
    return reachableFrom(out, [to]).has(from);
}

/** Drop every edge touching `starId`. Used when a star is deleted/consumed. */
export function edgesWithout(edges, starId) {
    return edges.filter(e => e.from !== starId && e.to !== starId);
}

/** De-duplicate, and drop any self-edges that slipped through. */
export function normalizeEdges(edges) {
    const seen = new Set();
    const result = [];
    edges.forEach(({ from, to }) => {
        if (from === to) return;
        const key = `${from}|${to}`;
        if (seen.has(key)) return;
        seen.add(key);
        result.push({ from, to });
    });
    return result;
}

/* ── Structural operations ────────────────────────────────────────────
 *
 * The rewiring that creation, mitosis and drag-reorder all need. Kept here,
 * pure and tested, because getting these wrong is what produced the original
 * bugs: edges left dangling on a removed star, and a "chain" that was really
 * a fan the reorder code could not read.
 */

/**
 * Pull `nodeId` (and anything travelling with it in `moveSet`) out of the
 * sequence, healing the gap: every predecessor is joined to every successor,
 * so removing a star from the middle of a chain closes it rather than
 * severing it. Edges wholly inside `moveSet` are preserved — a branch keeps
 * its shape while its owner moves.
 */
export function spliceOutNode(edges, nodeId, moveSet = new Set([nodeId])) {
    const preds = edges.filter(e => e.to === nodeId && !moveSet.has(e.from)).map(e => e.from);
    const succs = edges.filter(e => e.from === nodeId && !moveSet.has(e.to)).map(e => e.to);

    const kept = edges.filter((e) => {
        if (moveSet.has(e.from) && moveSet.has(e.to)) return true;
        return e.from !== nodeId && e.to !== nodeId;
    });
    preds.forEach(from => succs.forEach(to => kept.push({ from, to })));
    return normalizeEdges(kept);
}

/** Put `nodeId` in the middle of the `from → to` link. */
export function insertIntoEdge(edges, edge, nodeId) {
    const kept = edges.filter(e => !(e.from === edge.from && e.to === edge.to));
    kept.push({ from: edge.from, to: nodeId });
    kept.push({ from: nodeId, to: edge.to });
    return normalizeEdges(kept);
}

/** Chain `ids` head-to-tail: ids[0] → ids[1] → … */
export function chainEdges(ids) {
    const out = [];
    for (let i = 0; i < ids.length - 1; i++) out.push({ from: ids[i], to: ids[i + 1] });
    return out;
}

/**
 * Mitosis, parent consumed: the chain takes over the parent's slot entirely.
 * Everything that pointed at the parent points at the head of the chain;
 * everything the parent pointed at hangs off its tail. No edge is left
 * referencing the removed star.
 */
export function replaceNodeWithChain(edges, nodeId, chainIds) {
    if (chainIds.length === 0) return edgesWithout(edges, nodeId);
    const head = chainIds[0];
    const tail = chainIds[chainIds.length - 1];
    const incoming = edges.filter(e => e.to === nodeId).map(e => e.from);
    const outgoing = edges.filter(e => e.from === nodeId).map(e => e.to);

    const next = edgesWithout(edges, nodeId).concat(chainEdges(chainIds));
    incoming.forEach(from => { if (from !== nodeId) next.push({ from, to: head }); });
    outgoing.forEach(to => { if (to !== nodeId) next.push({ from: tail, to }); });
    return normalizeEdges(next);
}

/**
 * Mitosis, parent survives: the chain splices in AHEAD of the parent as its
 * prerequisites. The parent's predecessors now lead into the chain, and the
 * chain leads into the parent; its outgoing edges are untouched, so it holds
 * its place in the sequence.
 */
export function insertChainBefore(edges, nodeId, chainIds) {
    if (chainIds.length === 0) return normalizeEdges(edges);
    const head = chainIds[0];
    const tail = chainIds[chainIds.length - 1];
    const incoming = edges.filter(e => e.to === nodeId).map(e => e.from);

    const next = edges.filter(e => e.to !== nodeId).concat(chainEdges(chainIds));
    incoming.forEach(from => next.push({ from, to: head }));
    next.push({ from: tail, to: nodeId });
    return normalizeEdges(next);
}

/**
 * Sequence badges for edit mode: rank order as a number, with siblings
 * sharing a rank suffixed a/b/c so branches are legible ("3a", "3b").
 */
export function sequenceBadges(edges, nodeIds) {
    const rank = topoRank(edges, nodeIds);
    const byRank = new Map();
    nodeIds.forEach((id) => {
        const r = rank.get(id) ?? 0;
        if (!byRank.has(r)) byRank.set(r, []);
        byRank.get(r).push(id);
    });

    const badges = new Map();
    [...byRank.keys()].sort((a, b) => a - b).forEach((r) => {
        const group = byRank.get(r).slice().sort();
        group.forEach((id, i) => {
            badges.set(id, group.length === 1
                ? `${r + 1}`
                : `${r + 1}${String.fromCharCode(97 + i)}`);
        });
    });
    return badges;
}

/* ── Determinism ──────────────────────────────────────────────────────── */

/** mulberry32 — small, fast, fully deterministic for a given seed. */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** 32-bit rolling string hash (same form as the view's hashHueFromId). */
export function hashStringToInt(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return hash >>> 0;
}

/* ── Layout ───────────────────────────────────────────────────────────── */

/**
 * A layered/spine model (rank -> monotonically increasing x, with a bent
 * y/z curve layered on top) was tried first and rejected: a hand-authored
 * reference shape (STAR_DATA's old fixed 5-point `offsets`, scattered freely
 * over ~50-unit spacing with no dominant axis at all) reads as a much more
 * convincing constellation than anything the spine model produced, no matter
 * how much curve amplitude was added — because forcing every star to march
 * along one axis in rank order is itself the problem, not the amount of
 * wiggle on top of it.
 *
 * This is a proper 3D force-directed (spring) layout instead: repulsion
 * between every pair of stars, an attractive spring on each edge toward
 * `edgeLength`, and only a very weak radial "ranks sit farther out" bias so
 * the whole thing doesn't drift without end — no axis is privileged, so nothing
 * forces a straight line, and forking structure visibly spreads apart on its
 * own (two children of the same star both want to be `edgeLength` from their
 * parent but repel each other, so they splay outward into a real "V" — this
 * is the standard reason force-directed layout is used for tree/graph
 * drawing in the first place).
 */
export const LAYOUT_DEFAULTS = {
    // Rest length of the spring on each edge. The old hand-authored
    // reference shapes spaced connected stars ~46-56 units apart; matching
    // that exactly made the camera pull back far enough (to fit the whole
    // constellation in frame) that the stars themselves — fixed-size in
    // world units, a 1.4-radius gem plus a size-13 glow — read as small.
    // First brought down to 34, still reported as too spread/small — this is
    // a second, more decisive reduction toward the original layered model's
    // ~18-22, while staying just far enough apart that the force-directed
    // shape still reads as 3D rather than collapsing into one clump.
    edgeLength: 24,
    // Stars are r=1.4 gems wearing a size-13 glow sprite, so the glow — not
    // the gem — is what actually reads as overlap. Applies to EVERY pair,
    // connected or not. Kept close to the glow's own footprint rather than
    // scaled down in lockstep with edgeLength, or two adjacent stars would
    // visually merge.
    minSeparation: 14,
    // Coulomb-like repulsion constant: force = repulsion / distance^2,
    // applied between every pair of stars regardless of connectivity — this
    // is what keeps the whole shape spread out and prevents it collapsing
    // back toward a line or a tight clump. Scaled down with edgeLength
    // (roughly by its square, since repulsion falls off as 1/distance^2) so
    // the relative balance between repulsion and the spring stays the same.
    repulsion: 600,
    // How strongly an edge pulls its two stars toward edgeLength.
    springStiffness: 0.06,
    // A weak pull of each star's distance-from-centre toward
    // ringSpacing*(rank+1) — just enough that later stars in the sequence
    // trend outward and the whole cluster doesn't wander arbitrarily, far too
    // weak to force any particular axis or shape.
    radialStiffness: 0.015,
    ringSpacing: 22,
    iterations: 400,
};

/**
 * Nudges apart any pair of positions closer than `minSeparation`, moving
 * each the minimum needed, freely in 3D (no axis is preferred). Positions
 * that aren't in conflict with anything are returned untouched — this is
 * what "clean up only past a threshold" means: it is safe to run after a
 * manual drag or a freshly-placed star without disturbing anything that
 * wasn't actually overlapping.
 *
 * Deterministic: an exactly co-located pair is nudged using a seed derived
 * from both ids, never Math.random().
 *
 * @param {Map<string,{x,y,z}>} positions
 * @returns {Map<string,{x,y,z}>} a new map; the input is not mutated
 */
export function declutterPositions(positions, minSeparation) {
    const ids = [...positions.keys()];
    const pos = new Map(ids.map(id => [id, { ...positions.get(id) }]));
    if (ids.length < 2) return pos;

    for (let iter = 0; iter < 200; iter++) {
        let worst = 0;
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const a = pos.get(ids[i]);
                const b = pos.get(ids[j]);
                let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
                let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist >= minSeparation) continue;
                worst = Math.max(worst, minSeparation - dist);
                if (dist < 1e-4) {
                    const rng = mulberry32(hashStringToInt(ids[i] + '|' + ids[j]));
                    dx = rng() - 0.5; dy = rng() - 0.5; dz = rng() - 0.5;
                    dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
                }
                const push = (minSeparation - dist) / dist * 0.5 + 1e-6;
                a.x -= dx * push; a.y -= dy * push; a.z -= dz * push;
                b.x += dx * push; b.y += dy * push; b.z += dz * push;
            }
        }
        if (worst < 1e-3) break;
    }
    return pos;
}

/**
 * Compute a position for every star from the graph alone, via force
 * simulation. This is the single place star positions are ever decided from
 * scratch — used for a brand-new constellation's initial shape. Structural
 * edits to an EXISTING constellation deliberately do NOT call this (see
 * placeNewStars()/declutterConstellation() in the view) — once a star has a
 * position, whether from this or from being manually dragged, edits preserve
 * it rather than re-deriving everyone from the graph again.
 *
 * @returns {Map<string, {x:number,y:number,z:number}>}
 */
export function computeLayout(edges, nodeIds, options = {}) {
    const opt = { ...LAYOUT_DEFAULTS, ...options };
    const seedKey = options.seedKey ?? '';
    if (nodeIds.length === 0) return new Map();

    const clean = normalizeEdges(edges);
    const rank = topoRank(clean, nodeIds);

    // ── seed: scattered on a sphere whose radius grows with rank ──
    // Gives the simulation a reasonable, already-3D starting configuration
    // (rather than everyone at the origin) so it converges quickly and
    // deterministically rather than depending on iteration order to break
    // symmetry.
    const pos = new Map();
    nodeIds.forEach((id) => {
        const rng = mulberry32(hashStringToInt(seedKey + id));
        const theta = rng() * Math.PI * 2;
        const phi = Math.acos(rng() * 2 - 1);
        const r = opt.ringSpacing * ((rank.get(id) ?? 0) + 0.6) + (rng() - 0.5) * opt.ringSpacing * 0.5;
        pos.set(id, {
            x: Math.sin(phi) * Math.cos(theta) * r,
            y: Math.cos(phi) * r,
            z: Math.sin(phi) * Math.sin(theta) * r,
        });
    });

    // ── force simulation ──
    if (nodeIds.length > 1) {
        for (let iter = 0; iter < opt.iterations; iter++) {
            const force = new Map(nodeIds.map(id => [id, { x: 0, y: 0, z: 0 }]));
            const cooling = 1 - iter / opt.iterations;

            // repulsion — every pair, connected or not
            for (let i = 0; i < nodeIds.length; i++) {
                for (let j = i + 1; j < nodeIds.length; j++) {
                    const a = pos.get(nodeIds[i]);
                    const b = pos.get(nodeIds[j]);
                    let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
                    let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist < 1e-4) {
                        const rng = mulberry32(hashStringToInt(nodeIds[i] + nodeIds[j]));
                        dx = rng() - 0.5; dy = rng() - 0.5; dz = rng() - 0.5;
                        dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
                    }
                    const f = opt.repulsion / (dist * dist);
                    const fx = (dx / dist) * f, fy = (dy / dist) * f, fz = (dz / dist) * f;
                    const fa = force.get(nodeIds[i]);
                    const fb = force.get(nodeIds[j]);
                    fa.x -= fx; fa.y -= fy; fa.z -= fz;
                    fb.x += fx; fb.y += fy; fb.z += fz;
                }
            }

            // springs — edges pull toward edgeLength. Non-adjacent stars at
            // the same fork (two children of one star, say) have NO spring
            // between them, so repulsion alone pushes them apart into a
            // visible branch rather than a parallel lane.
            clean.forEach(({ from, to }) => {
                const a = pos.get(from), b = pos.get(to);
                if (!a || !b) return;
                const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;
                const f = (dist - opt.edgeLength) * opt.springStiffness;
                const fx = (dx / dist) * f, fy = (dy / dist) * f, fz = (dz / dist) * f;
                const fa = force.get(from), fb = force.get(to);
                fa.x += fx; fa.y += fy; fa.z += fz;
                fb.x -= fx; fb.y -= fy; fb.z -= fz;
            });

            // weak radial bias — later ranks trend outward, without pinning
            // any axis or angle.
            nodeIds.forEach((id) => {
                const p = pos.get(id);
                const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) || 1e-4;
                const targetR = opt.ringSpacing * ((rank.get(id) ?? 0) + 0.6);
                const f = (targetR - r) * opt.radialStiffness;
                const fr = force.get(id);
                fr.x += (p.x / r) * f; fr.y += (p.y / r) * f; fr.z += (p.z / r) * f;
            });

            // apply, with a cooling-limited step so the simulation settles
            // instead of oscillating.
            const maxStep = 8 * cooling + 0.4;
            nodeIds.forEach((id) => {
                const p = pos.get(id), f = force.get(id);
                const mag = Math.sqrt(f.x * f.x + f.y * f.y + f.z * f.z) || 1e-6;
                const scale = Math.min(mag, maxStep) / mag;
                p.x += f.x * scale; p.y += f.y * scale; p.z += f.z * scale;
            });
        }
    }

    // ── hard separation ──
    // The simulation converges toward minSeparation but doesn't strictly
    // guarantee it (a dense cluster can settle fractionally short); this
    // pass enforces the invariant outright, freely in 3D — there is no axis
    // left to protect once the layered/spine model is gone.
    const settled = declutterPositions(pos, opt.minSeparation);

    // ── un-flatten ──
    // Path-like graphs (chains, and chains with a branch or two) have a
    // known tendency to settle into a roughly PLANAR force-equilibrium — the
    // simulation above has no directional preference, but "confined near one
    // plane" is nonetheless often a locally stable outcome for this shape of
    // graph. If world-axis spread ended up lopsided (one axis carrying much
    // less of the shape than the other two), stretch just that axis back
    // out around the centroid. Which axis gets stretched is decided by the
    // OUTCOME, not fixed in advance, so this doesn't privilege any axis —
    // it only prevents whichever one happened to go flat from staying flat.
    if (nodeIds.length > 2) {
        const spreadOf = (axis) => {
            let min = Infinity, max = -Infinity;
            nodeIds.forEach((id) => {
                const v = settled.get(id)[axis];
                if (v < min) min = v;
                if (v > max) max = v;
            });
            return max - min;
        };
        const spreads = { x: spreadOf('x'), y: spreadOf('y'), z: spreadOf('z') };
        const maxSpread = Math.max(spreads.x, spreads.y, spreads.z);
        if (maxSpread > 1e-3) {
            const mid = { x: 0, y: 0, z: 0 };
            nodeIds.forEach((id) => {
                const p = settled.get(id);
                mid.x += p.x; mid.y += p.y; mid.z += p.z;
            });
            mid.x /= nodeIds.length; mid.y /= nodeIds.length; mid.z /= nodeIds.length;

            ['x', 'y', 'z'].forEach((axis) => {
                if (spreads[axis] >= maxSpread * 0.45) return;
                const targetSpread = maxSpread * 0.55;
                const scale = spreads[axis] > 1e-3 ? targetSpread / spreads[axis] : 1;
                nodeIds.forEach((id) => {
                    const p = settled.get(id);
                    p[axis] = mid[axis] + (p[axis] - mid[axis]) * scale;
                });
            });
        }
    }

    // Centre the whole constellation on its own centroid, so it stays framed
    // where the camera expects regardless of how many ranks it grew.
    const centroid = { x: 0, y: 0, z: 0 };
    nodeIds.forEach((id) => {
        const p = settled.get(id);
        centroid.x += p.x; centroid.y += p.y; centroid.z += p.z;
    });
    centroid.x /= nodeIds.length;
    centroid.y /= nodeIds.length;
    centroid.z /= nodeIds.length;
    nodeIds.forEach((id) => {
        const p = settled.get(id);
        p.x -= centroid.x; p.y -= centroid.y; p.z -= centroid.z;
    });

    return settled;
}

/** Smallest distance between any two positions — the overlap check. */
export function minPairDistance(positions) {
    const list = [...positions.values()];
    let min = Infinity;
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const dx = list[i].x - list[j].x;
            const dy = list[i].y - list[j].y;
            const dz = list[i].z - list[j].z;
            min = Math.min(min, Math.sqrt(dx * dx + dy * dy + dz * dz));
        }
    }
    return min;
}

/* ── Camera framing ───────────────────────────────────────────────────── */

/**
 * ~250 roughly-evenly-spaced unit directions (a Fibonacci sphere: ~7° average
 * spacing), used as the candidate set for bestViewAxis. Fixed and
 * deterministic — no RNG involved. Needs to be dense enough that the tight
 * tolerance band below (tuned to reject anything that isn't genuinely close
 * to flattest) still reliably finds a good candidate; the framing call this
 * feeds happens only on constellation focus / lock-in / star creation, never
 * per-frame, so the extra candidates cost nothing that matters.
 */
function fibonacciSphere(n) {
    const pts = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = golden * i;
        pts.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
    }
    return pts;
}
const VIEW_AXIS_CANDIDATES = fibonacciSphere(250);

/**
 * Which direction should the camera look ALONG to show a point cloud as
 * spread-out as possible?
 *
 * The previous approach found the axis of GREATEST spread (PCA's dominant
 * eigenvector) and aimed the camera perpendicular to just that one axis. That
 * only guarantees the single most-spread-out axis lands on screen — if the
 * point cloud's second-most-spread axis happens to point roughly along the
 * chosen view direction anyway (entirely possible; the two are unrelated),
 * both meaningful axes end up compressed into depth and the constellation
 * reads as a flat line, which is exactly what was reported.
 *
 * This instead searches candidate directions directly for the one the point
 * cloud has the LEAST spread ALONG — i.e. the flattest viewing direction —
 * which by construction puts BOTH of the other two (larger-spread) axes on
 * screen simultaneously. Among near-tied flattest candidates (a symmetric or
 * near-planar cloud can have more than one), the one closest to
 * `preferredDir` wins, so the camera still favours looking outward from the
 * North Star when the shape itself doesn't force a particular choice.
 *
 * Pure geometry, no THREE dependency — points/centroid/preferredDir are all
 * plain {x,y,z}.
 *
 * @returns {{x:number,y:number,z:number}} unit vector to view ALONG
 */
export function bestViewAxis(points, centroid, preferredDir) {
    if (points.length === 0) return { ...preferredDir };

    let minVar = Infinity, maxVar = -Infinity;
    const scored = VIEW_AXIS_CANDIDATES.map((d) => {
        let variance = 0;
        points.forEach((p) => {
            const proj = (p.x - centroid.x) * d.x + (p.y - centroid.y) * d.y + (p.z - centroid.z) * d.z;
            variance += proj * proj;
        });
        variance /= points.length;
        minVar = Math.min(minVar, variance);
        maxVar = Math.max(maxVar, variance);
        return { d, variance };
    });

    // "Flat enough" band around the true minimum, so genuine near-ties (a
    // symmetric or near-planar cloud can have several) are broken by
    // preferredDir. This must stay tight relative to minVar itself, NOT a
    // fraction of the full min→max range — variance grows with the SQUARE of
    // how far a candidate is from the true flattest direction, so a range-
    // relative band (even 15%) admits candidates that are visibly not flat
    // at all once the cloud has any real spread, which is exactly the "still
    // lines up" failure mode this function exists to prevent.
    const tolerance = minVar * 1.02 + (maxVar - minVar) * 1e-4;
    let best = null, bestAlignment = -Infinity;
    scored.forEach(({ d, variance }) => {
        if (variance > tolerance) return;
        const alignment = Math.abs(d.x * preferredDir.x + d.y * preferredDir.y + d.z * preferredDir.z);
        if (alignment > bestAlignment) { bestAlignment = alignment; best = d; }
    });
    if (!best) best = scored.reduce((a, b) => (a.variance < b.variance ? a : b)).d;

    const dot = best.x * preferredDir.x + best.y * preferredDir.y + best.z * preferredDir.z;
    const sign = dot < 0 ? -1 : 1;
    return { x: best.x * sign, y: best.y * sign, z: best.z * sign };
}
