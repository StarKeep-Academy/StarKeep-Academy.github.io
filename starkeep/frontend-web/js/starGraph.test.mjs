import {
    topoRank, dominatedSet, dragMoveSet, wouldCreateCycle, graphRoots, graphTails,
    computeLayout, minPairDistance, sequenceBadges, normalizeEdges, bestViewAxis,
    spliceOutNode, insertIntoEdge, replaceNodeWithChain, insertChainBefore,
    chainEdges, LAYOUT_DEFAULTS, declutterPositions,
} from './starGraph.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
function eqSet(a, b) {
    if (a.size !== b.length) return false;
    return b.every(x => a.has(x));
}

const E = (...pairs) => pairs.map(([from, to]) => ({ from, to }));

console.log('\n== topoRank ==');
{
    // linear chain a->b->c->d
    const ids = ['a', 'b', 'c', 'd'];
    const edges = E(['a', 'b'], ['b', 'c'], ['c', 'd']);
    const r = topoRank(edges, ids);
    check('chain ranks 0,1,2,3', r.get('a') === 0 && r.get('b') === 1 && r.get('c') === 2 && r.get('d') === 3,
        JSON.stringify([...r]));
}
{
    // branch: a->b, b->c, b->d
    const ids = ['a', 'b', 'c', 'd'];
    const edges = E(['a', 'b'], ['b', 'c'], ['b', 'd']);
    const r = topoRank(edges, ids);
    check('branch siblings share rank 2', r.get('c') === 2 && r.get('d') === 2, JSON.stringify([...r]));
}
{
    // diamond: a->b->d, a->c->d  PLUS long path a->b->x->d to test LONGEST path
    const ids = ['a', 'b', 'c', 'd', 'x'];
    const edges = E(['a', 'b'], ['a', 'c'], ['c', 'd'], ['b', 'x'], ['x', 'd']);
    const r = topoRank(edges, ids);
    check('diamond uses LONGEST path (d=3 not 2)', r.get('d') === 3, `d=${r.get('d')}`);
    check('diamond: c=1, x=2', r.get('c') === 1 && r.get('x') === 2, JSON.stringify([...r]));
}
{
    const ids = ['a'];
    check('single node rank 0', topoRank([], ids).get('a') === 0);
}

console.log('\n== graphRoots / graphTails ==');
{
    const ids = ['a', 'b', 'c', 'd'];
    const edges = E(['a', 'b'], ['b', 'c'], ['b', 'd']);
    check('roots = [a]', JSON.stringify(graphRoots(edges, ids)) === '["a"]');
    check('tails = [c,d]', JSON.stringify(graphTails(edges, ids)) === '["c","d"]');
    check('no edges -> all roots and all tails',
        graphRoots([], ids).length === 4 && graphTails([], ids).length === 4);
}

console.log('\n== dominatedSet ==');
{
    // plain branch: a->b, b->c, b->d.  Dragging b must take c and d.
    const ids = ['a', 'b', 'c', 'd'];
    const edges = E(['a', 'b'], ['b', 'c'], ['b', 'd']);
    check('branch: drag b takes {b,c,d}', eqSet(dominatedSet(edges, 'b', ids), ['b', 'c', 'd']),
        JSON.stringify([...dominatedSet(edges, 'b', ids)]));
    check('leaf: drag c takes {c} only', eqSet(dominatedSet(edges, 'c', ids), ['c']));
    check('root: drag a takes everything', eqSet(dominatedSet(edges, 'a', ids), ['a', 'b', 'c', 'd']));
}
{
    // MERGE case: a->b->d, a->c->d.  Dragging b must NOT take d (c also reaches it).
    const ids = ['a', 'b', 'c', 'd'];
    const edges = E(['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']);
    const dom = dominatedSet(edges, 'b', ids);
    check('merge: drag b takes {b} only, NOT d', eqSet(dom, ['b']), JSON.stringify([...dom]));
}
{
    // branch that merges back further down:
    // a->b->c->e, b->d->e   (d is exclusive to b, e is not)
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const edges = E(['a', 'b'], ['b', 'c'], ['c', 'e'], ['b', 'd'], ['d', 'e']);
    const dom = dominatedSet(edges, 'b', ids);
    check('rejoining branch: drag b takes {b,c,d,e} (b dominates all)',
        eqSet(dom, ['b', 'c', 'd', 'e']), JSON.stringify([...dom]));
    const domC = dominatedSet(edges, 'c', ids);
    check('rejoining branch: drag c takes {c} only (e reachable via d)',
        eqSet(domC, ['c']), JSON.stringify([...domC]));
}

console.log('\n== wouldCreateCycle ==');
{
    const edges = E(['a', 'b'], ['b', 'c']);
    check('back-edge c->a rejected', wouldCreateCycle(edges, 'c', 'a') === true);
    check('self-edge rejected', wouldCreateCycle(edges, 'a', 'a') === true);
    check('forward cross-edge a->c allowed', wouldCreateCycle(edges, 'a', 'c') === false);
    check('new node edge c->d allowed', wouldCreateCycle(edges, 'c', 'd') === false);
}

console.log('\n== normalizeEdges ==');
{
    const e = E(['a', 'b'], ['a', 'b'], ['c', 'c'], ['b', 'c']);
    const n = normalizeEdges(e);
    check('dedupes and drops self-edges', n.length === 2, JSON.stringify(n));
}

console.log('\n== sequenceBadges ==');
{
    const ids = ['a', 'b', 'c', 'd'];
    const edges = E(['a', 'b'], ['b', 'c'], ['b', 'd']);
    const b = sequenceBadges(edges, ids);
    check('linear parts numbered', b.get('a') === '1' && b.get('b') === '2');
    check('siblings suffixed a/b', b.get('c') === '3a' && b.get('d') === '3b',
        `${b.get('c')} ${b.get('d')}`);
}

console.log('\n== computeLayout: separation (the overlap regression) ==');
const topologies = {
    'linear-20': (() => {
        const ids = Array.from({ length: 20 }, (_, i) => `s${i}`);
        return { ids, edges: ids.slice(1).map((id, i) => ({ from: ids[i], to: id })) };
    })(),
    'wide-fan': (() => {
        const ids = ['root', ...Array.from({ length: 12 }, (_, i) => `k${i}`)];
        return { ids, edges: ids.slice(1).map(id => ({ from: 'root', to: id })) };
    })(),
    'diamond-heavy': (() => {
        const ids = ['a'];
        const edges = [];
        for (let i = 0; i < 6; i++) {
            const l = `l${i}`, r = `r${i}`, m = `m${i}`;
            const prev = ids[ids.length - 1];
            ids.push(l, r, m);
            edges.push({ from: prev, to: l }, { from: prev, to: r },
                       { from: l, to: m }, { from: r, to: m });
        }
        return { ids, edges };
    })(),
    'disconnected': (() => {
        const ids = Array.from({ length: 15 }, (_, i) => `d${i}`);
        return { ids, edges: [] };   // worst case: no structure at all
    })(),
    'mitosis-repeat': (() => {
        // simulates the reported bug: split, split a child, split again
        const ids = ['p', 'x1', 'x2', 'x3', 'y1', 'y2', 'z1', 'z2', 'tail'];
        const edges = E(['p', 'x1'], ['x1', 'x2'], ['x2', 'x3'], ['x3', 'tail'],
                        ['x2', 'y1'], ['y1', 'y2'], ['y2', 'x3'],
                        ['y1', 'z1'], ['z1', 'z2'], ['z2', 'y2']);
        return { ids, edges };
    })(),
};
for (const [name, { ids, edges }] of Object.entries(topologies)) {
    const p = computeLayout(edges, ids, { seedKey: 'c0:' });
    const min = minPairDistance(p);
    check(`${name}: min separation ${min.toFixed(2)} >= ${LAYOUT_DEFAULTS.minSeparation}`,
        min >= LAYOUT_DEFAULTS.minSeparation - 0.01, `got ${min.toFixed(3)}`);
    check(`${name}: all positions finite`,
        [...p.values()].every(v => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)));
    check(`${name}: every node placed`, p.size === ids.length);
}

console.log('\n== computeLayout: determinism ==');
{
    const { ids, edges } = topologies['diamond-heavy'];
    const a = computeLayout(edges, ids, { seedKey: 'c0:' });
    const b = computeLayout(edges, ids, { seedKey: 'c0:' });
    const same = ids.every(id =>
        a.get(id).x === b.get(id).x && a.get(id).y === b.get(id).y && a.get(id).z === b.get(id).z);
    check('same graph -> identical positions', same);

    // shuffled edge/node input order must not change the result
    const shuffled = computeLayout([...edges].reverse(), [...ids].reverse(), { seedKey: 'c0:' });
    const stable = ids.every(id =>
        Math.abs(a.get(id).x - shuffled.get(id).x) < 1e-9 &&
        Math.abs(a.get(id).y - shuffled.get(id).y) < 1e-9 &&
        Math.abs(a.get(id).z - shuffled.get(id).z) < 1e-9);
    check('input order does not affect layout', stable);

    const other = computeLayout(edges, ids, { seedKey: 'c1:' });
    const differs = ids.some(id => a.get(id).y !== other.get(id).y);
    check('different constellation seed -> different shape', differs);
}

console.log('\n== computeLayout: no dominant axis (force-directed, not spine-based) ==');
{
    // The old layered/spine model pinned rank strictly to x. The
    // force-directed model deliberately has NO privileged axis — a real
    // constellation shouldn't read as "a line with wiggles on top." Confirm
    // there's no axis that soaks up dramatically more of the spread than the
    // others.
    const ids = Array.from({ length: 7 }, (_, i) => `s${i}`);
    const edges = chainEdges(ids);
    const p = computeLayout(edges, ids, { seedKey: 'c0:' });
    const pts = ids.map(id => p.get(id));
    const spread = axis => Math.max(...pts.map(pt => pt[axis])) - Math.min(...pts.map(pt => pt[axis]));
    const sx = spread('x'), sy = spread('y'), sz = spread('z');
    const maxSpread = Math.max(sx, sy, sz), minSpread = Math.min(sx, sy, sz);
    check(`spread is comparable across all three axes (x=${sx.toFixed(0)} y=${sy.toFixed(0)} z=${sz.toFixed(0)})`,
        minSpread > maxSpread * 0.3, `ratio ${(minSpread / maxSpread).toFixed(2)}`);
}

console.log('\n== computeLayout: branches actually diverge ==');
{
    // A fork: one parent, two children with independent tails and no edge
    // between the branches. With no spring pulling them together, mutual
    // repulsion should splay them into a real "V", not two parallel lanes a
    // fixed sibling-offset apart.
    const ids = ['root', 'a1', 'a2', 'a3', 'b1', 'b2', 'b3'];
    const edges = E(
        ['root', 'a1'], ['a1', 'a2'], ['a2', 'a3'],
        ['root', 'b1'], ['b1', 'b2'], ['b2', 'b3'],
    );
    const p = computeLayout(edges, ids, { seedKey: 'cBranch:' });
    const dist = (a, b) => Math.hypot(p.get(a).x - p.get(b).x, p.get(a).y - p.get(b).y, p.get(a).z - p.get(b).z);

    const nearGap = dist('a1', 'b1');
    const farGap = dist('a3', 'b3');
    check(`branch tips are well-separated from each other (gap ${farGap.toFixed(0)})`,
        farGap > LAYOUT_DEFAULTS.edgeLength * 0.8, `got ${farGap.toFixed(1)}`);
    check(`divergence grows with distance from the fork (near=${nearGap.toFixed(0)}, far=${farGap.toFixed(0)})`,
        farGap > nearGap, `near=${nearGap.toFixed(1)} far=${farGap.toFixed(1)}`);
}
{
    // Regression for the reported complaint: even WITH a branch present, the
    // overall shape must not collapse toward one axis (the earlier
    // spine-based algorithm still read as "a line" here despite the branch).
    const ids = ['root', 'a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2'];
    const edges = E(
        ['root', 'a1'], ['a1', 'a2'], ['a2', 'a3'],
        ['root', 'b1'], ['b1', 'b2'], ['b2', 'b3'],
        ['a1', 'c1'], ['c1', 'c2'],
    );
    const p = computeLayout(edges, ids, { seedKey: 'cBranch2:' });
    const pts = ids.map(id => p.get(id));
    const spread = axis => Math.max(...pts.map(pt => pt[axis])) - Math.min(...pts.map(pt => pt[axis]));
    const sx = spread('x'), sy = spread('y'), sz = spread('z');
    const minSpread = Math.min(sx, sy, sz), maxSpread = Math.max(sx, sy, sz);
    check(`branching shape also spreads across all three axes (x=${sx.toFixed(0)} y=${sy.toFixed(0)} z=${sz.toFixed(0)})`,
        minSpread > maxSpread * 0.25, `ratio ${(minSpread / maxSpread).toFixed(2)}`);
}

console.log('\n== computeLayout: never a straight line, even unbranched ==');
{
    // A plain 8-star chain, no branches at all — this is the exact case the
    // user flagged: "even a single line sequence... should never be straight."
    const ids = Array.from({ length: 8 }, (_, i) => `s${i}`);
    const edges = chainEdges(ids);
    const p = computeLayout(edges, ids, { seedKey: 'c7:' });
    const pts = ids.map(id => p.get(id));

    // Perpendicular distance from each point to the straight line through the
    // first and last star — zero for every point would mean it IS straight.
    const p0 = pts[0], p1 = pts[pts.length - 1];
    const dir = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z };
    const dirLen = Math.hypot(dir.x, dir.y, dir.z) || 1;
    let maxDeviation = 0;
    pts.forEach((pt) => {
        const v = { x: pt.x - p0.x, y: pt.y - p0.y, z: pt.z - p0.z };
        const t = (v.x * dir.x + v.y * dir.y + v.z * dir.z) / (dirLen * dirLen);
        const closest = { x: p0.x + dir.x * t, y: p0.y + dir.y * t, z: p0.z + dir.z * t };
        const dev = Math.hypot(pt.x - closest.x, pt.y - closest.y, pt.z - closest.z);
        maxDeviation = Math.max(maxDeviation, dev);
    });
    check(`unbranched chain visibly bows off its own end-to-end line (deviation ${maxDeviation.toFixed(2)} > 3)`,
        maxDeviation > 3, `got ${maxDeviation.toFixed(3)}`);

    // Genuinely 3D: z-spread should be a real fraction of y-spread, not a
    // flat slab masquerading as a shape.
    const ys = pts.map(pt => pt.y), zs = pts.map(pt => pt.z);
    const spread = arr => Math.max(...arr) - Math.min(...arr);
    const ySpread = spread(ys), zSpread = spread(zs);
    check(`z-spread is a real fraction of y-spread (z=${zSpread.toFixed(1)}, y=${ySpread.toFixed(1)})`,
        zSpread > ySpread * 0.25, `ratio ${(zSpread / ySpread).toFixed(2)}`);

    // Consecutive-star distances shouldn't be perfectly uniform — "a small
    // random offset on that distancing."
    const gaps = [];
    for (let i = 0; i < pts.length - 1; i++) {
        gaps.push(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y, pts[i + 1].z - pts[i].z));
    }
    const gapSpread = Math.max(...gaps) - Math.min(...gaps);
    check(`consecutive-star spacing varies (spread ${gapSpread.toFixed(2)} > 1)`, gapSpread > 1, JSON.stringify(gaps.map(g => +g.toFixed(1))));
}
{
    // Different constellations (different seedKey) must curve differently —
    // otherwise every constellation in the sky would look the same.
    const ids = Array.from({ length: 6 }, (_, i) => `s${i}`);
    const edges = chainEdges(ids);
    const a = computeLayout(edges, ids, { seedKey: 'cA:' });
    const b = computeLayout(edges, ids, { seedKey: 'cB:' });
    const differs = ids.some(id => Math.abs(a.get(id).y - b.get(id).y) > 0.5);
    check('different constellations curve differently', differs);
}

console.log('\n== declutterPositions (manual-placement cleanup) ==');
{
    // Nothing overlapping -> nothing should move at all. This is the actual
    // guarantee behind "manual placement is preserved, only clean up past a
    // threshold" — declutter must be a no-op unless something is genuinely
    // too close.
    const positions = new Map([
        ['a', { x: 0, y: 0, z: 0 }],
        ['b', { x: 100, y: 0, z: 0 }],
        ['c', { x: 0, y: 100, z: 0 }],
    ]);
    const out = declutterPositions(positions, 24);
    let unchanged = true;
    positions.forEach((p, id) => {
        const o = out.get(id);
        if (Math.abs(o.x - p.x) > 1e-9 || Math.abs(o.y - p.y) > 1e-9 || Math.abs(o.z - p.z) > 1e-9) unchanged = false;
    });
    check('non-conflicting positions are left exactly as-is', unchanged);

    // Input map itself must not be mutated — callers hand it live star
    // positions and read the RETURN value, not the input.
    check('input map is not mutated', positions.get('a').x === 0);
}
{
    const positions = new Map([
        ['a', { x: 0, y: 0, z: 0 }],
        ['b', { x: 5, y: 0, z: 0 }],   // well inside minSeparation of a
        ['c', { x: 200, y: 0, z: 0 }], // far from everything, should not move
    ]);
    const out = declutterPositions(positions, 24);
    const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    check('overlapping pair separated to at least minSeparation',
        dist(out.get('a'), out.get('b')) >= 24 - 1e-3, dist(out.get('a'), out.get('b')));
    check('uninvolved star left untouched',
        Math.abs(out.get('c').x - 200) < 1e-6, out.get('c').x);
}
{
    // Exactly co-located pair: must resolve deterministically, not via
    // Math.random().
    const positions = new Map([['a', { x: 3, y: 3, z: 3 }], ['b', { x: 3, y: 3, z: 3 }]]);
    const out1 = declutterPositions(positions, 20);
    const out2 = declutterPositions(positions, 20);
    check('co-located pair resolves deterministically',
        out1.get('a').x === out2.get('a').x && out1.get('a').y === out2.get('a').y);
    const dist = Math.hypot(out1.get('a').x - out1.get('b').x, out1.get('a').y - out1.get('b').y, out1.get('a').z - out1.get('b').z);
    check('co-located pair ends up properly separated', dist >= 20 - 1e-3, dist);
}

console.log('\n== bestViewAxis (camera framing) ==');
{
    const variance = (points, centroid, d) => {
        let v = 0;
        points.forEach((p) => {
            const proj = (p.x - centroid.x) * d.x + (p.y - centroid.y) * d.y + (p.z - centroid.z) * d.z;
            v += proj * proj;
        });
        return v / points.length;
    };
    const norm = v => Math.hypot(v.x, v.y, v.z);

    // Flat cloud entirely in the XY plane (constant z): the flattest view
    // axis must be (near) the Z axis, regardless of how the XY spread is
    // shaped, so both real axes of spread land on screen.
    {
        const points = [
            { x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 },
            { x: 0, y: -6, z: 0 }, { x: 0, y: 6, z: 0 },
            { x: 4, y: 3, z: 0 }, { x: -4, y: -3, z: 0 },
        ];
        const centroid = { x: 0, y: 0, z: 0 };
        const axis = bestViewAxis(points, centroid, { x: 0, y: 0, z: 1 });
        check('unit length', Math.abs(norm(axis) - 1) < 1e-6, norm(axis));
        check('flat XY cloud -> view axis is ~Z',
            Math.abs(axis.x) < 0.05 && Math.abs(axis.y) < 0.05 && Math.abs(axis.z) > 0.99,
            JSON.stringify(axis));
        // Discrete candidate set (~7° resolution), so "flat" means negligible
        // relative to the cloud's own spread (~10^2), not literally zero.
        check('variance along chosen axis negligible relative to the cloud spread',
            variance(points, centroid, axis) < 0.5, variance(points, centroid, axis));
    }

    // Purely 1D cloud along X: the true flattest set is the WHOLE plane
    // perpendicular to X, and the candidate grid happens to include an EXACT
    // zero-variance point at its pole — flatness must never be traded away
    // for alignment, so that exact candidate should win regardless of
    // preferredDir, not whichever near-zero candidate aligns best with it.
    {
        const points = Array.from({ length: 6 }, (_, i) => ({ x: (i - 2.5) * 10, y: 0, z: 0 }));
        const centroid = { x: 0, y: 0, z: 0 };
        const preferred = { x: 0, y: 0.6, z: 0.8 };
        const axis = bestViewAxis(points, centroid, preferred);
        check('1D-along-X cloud -> chosen axis has ~no X component',
            Math.abs(axis.x) < 0.1, JSON.stringify(axis));
        check('genuinely flat (variance ~0), not just "close enough to align"',
            variance(points, centroid, axis) < 1e-6, variance(points, centroid, axis));
    }

    // Genuine tie: a cloud with octahedral symmetry has IDENTICAL variance
    // along every direction (no flattest axis is more correct than any
    // other), so this is the case where the tie-break should actually kick
    // in and preferredDir should win outright.
    {
        const R = 20;
        const points = [
            { x: R, y: 0, z: 0 }, { x: -R, y: 0, z: 0 },
            { x: 0, y: R, z: 0 }, { x: 0, y: -R, z: 0 },
            { x: 0, y: 0, z: R }, { x: 0, y: 0, z: -R },
        ];
        const centroid = { x: 0, y: 0, z: 0 };
        const preferred = { x: 0.28, y: 0.6, z: 0.75 };
        const axis = bestViewAxis(points, centroid, preferred);
        const alignment = axis.x * preferred.x + axis.y * preferred.y + axis.z * preferred.z;
        check('symmetric cloud (true tie) -> tie-break follows preferredDir',
            alignment > 0.9, `alignment=${alignment.toFixed(3)} axis=${JSON.stringify(axis)}`);
    }

    // A "real constellation" shape: mostly along X with real Y and Z spread
    // (the kind computeLayout now produces) — the chosen axis must actually
    // be close to the true minimum-variance direction, not just "perpendicular
    // to the biggest axis" (which is the bug being fixed: that can still
    // collapse the SECOND axis into depth).
    {
        const points = [];
        for (let i = 0; i < 10; i++) {
            points.push({ x: i * 20, y: Math.sin(i * 0.6) * 15, z: Math.sin(i * 1.3 + 1) * 11 });
        }
        const centroid = { x: 0, y: 0, z: 0 };
        points.forEach(p => { centroid.x += p.x; centroid.y += p.y; centroid.z += p.z; });
        centroid.x /= points.length; centroid.y /= points.length; centroid.z /= points.length;

        const axis = bestViewAxis(points, centroid, { x: 1, y: 0, z: 0 });
        // Brute-force the true minimum over a much finer candidate set, as an
        // independent check that the exported function's own answer is close.
        let trueMin = Infinity;
        for (let i = 0; i < 4000; i++) {
            const y = 1 - (i / 3999) * 2;
            const r = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = Math.PI * (3 - Math.sqrt(5)) * i;
            const d = { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
            trueMin = Math.min(trueMin, variance(points, centroid, d));
        }
        const chosenVar = variance(points, centroid, axis);
        check(`chosen axis is near the true flattest direction (chosen=${chosenVar.toFixed(2)}, true min=${trueMin.toFixed(2)})`,
            chosenVar < trueMin * 1.5 + 1, `ratio ${(chosenVar / (trueMin || 1)).toFixed(2)}`);
    }

    check('empty points -> returns preferredDir', (() => {
        const r = bestViewAxis([], { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
        return r.y === 1;
    })());
}

console.log('\n== edge cases ==');
{
    check('empty graph returns empty map', computeLayout([], [], {}).size === 0);
    const one = computeLayout([], ['solo'], { seedKey: 'c0:' });
    check('single node centred at origin',
        Math.abs(one.get('solo').x) < 1e-9 && Math.abs(one.get('solo').y) < 1e-9);
}

const nodesOf = es => [...new Set(es.flatMap(e => [e.from, e.to]))];
const S = es => es.map(e => `${e.from}>${e.to}`).sort().join(' ');

// Every edge must reference a live node — the dangling-edge class of bug.
function assertNoDangling(name, edges, liveIds) {
    const live = new Set(liveIds);
    const bad = edges.filter(e => !live.has(e.from) || !live.has(e.to));
    check(`${name}: no dangling edges`, bad.length === 0, JSON.stringify(bad));
}
// A DAG must stay a DAG.
function assertAcyclic(name, edges, ids) {
    const rank = topoRank(edges, ids);
    const bad = edges.filter(e => (rank.get(e.to) ?? 0) <= (rank.get(e.from) ?? 0));
    check(`${name}: acyclic`, bad.length === 0, JSON.stringify(bad));
}

console.log('\n== spliceOutNode ==');
{
    const e = E(['a','b'],['b','c'],['c','d']);
    check('middle removal heals the chain', S(spliceOutNode(e,'b')) === S(E(['a','c'],['c','d'])), S(spliceOutNode(e,'b')));
    check('head removal leaves the rest', S(spliceOutNode(e,'a')) === S(E(['b','c'],['c','d'])));
    check('tail removal leaves the rest', S(spliceOutNode(e,'d')) === S(E(['a','b'],['b','c'])));
}
{
    // branch node: a->b, b->c, b->d, c->e, d->e
    const e = E(['a','b'],['b','c'],['b','d'],['c','e'],['d','e']);
    const r = spliceOutNode(e,'b');
    check('branch node removal joins pred to both succs', S(r) === S(E(['a','c'],['a','d'],['c','e'],['d','e'])), S(r));
    assertNoDangling('branch splice', r, ['a','c','d','e']);
}
{
    // dragging b WITH its exclusive branch {b,d}: internal edge b->d survives
    const e = E(['a','b'],['b','c'],['b','d'],['d','x']);
    const moveSet = new Set(['b','d','x']);
    const r = spliceOutNode(e,'b',moveSet);
    check('moveSet-internal edges preserved',
        S(r) === S(E(['a','c'],['b','d'],['d','x'])), S(r));
}

console.log('\n== insertIntoEdge ==');
{
    const e = E(['a','b'],['b','c']);
    const r = insertIntoEdge(e, {from:'a',to:'b'}, 'x');
    check('splits the edge', S(r) === S(E(['a','x'],['x','b'],['b','c'])), S(r));
    assertAcyclic('insertIntoEdge', r, nodesOf(r));
}

console.log('\n== replaceNodeWithChain (mitosis: parent consumed) ==');
{
    // p is mid-chain: a->p->z.  Split p into x1,x2,x3.
    const e = E(['a','p'],['p','z']);
    const r = replaceNodeWithChain(e,'p',['x1','x2','x3']);
    check('chain takes over the slot in order',
        S(r) === S(E(['a','x1'],['x1','x2'],['x2','x3'],['x3','z'])), S(r));
    assertNoDangling('consumed parent', r, ['a','z','x1','x2','x3']);
    assertAcyclic('consumed parent', r, nodesOf(r));
    check('parent id gone entirely', !r.some(x => x.from==='p'||x.to==='p'));
}
{
    // parent with MULTIPLE preds and succs (the fan case the old code broke on)
    const e = E(['a','p'],['b','p'],['p','y'],['p','z']);
    const r = replaceNodeWithChain(e,'p',['x1','x2']);
    check('all preds -> head, all succs <- tail',
        S(r) === S(E(['a','x1'],['b','x1'],['x1','x2'],['x2','y'],['x2','z'])), S(r));
    assertNoDangling('fan parent consumed', r, ['a','b','y','z','x1','x2']);
}
{
    const e = E(['p','z']);            // parent is the root
    const r = replaceNodeWithChain(e,'p',['x1']);
    check('root parent consumed', S(r) === S(E(['x1','z'])), S(r));
}
{
    const r = replaceNodeWithChain([], 'p', ['x1','x2']);
    check('lone parent consumed -> just the chain', S(r) === S(E(['x1','x2'])), S(r));
}

console.log('\n== insertChainBefore (mitosis: parent survives) ==');
{
    const e = E(['a','p'],['p','z']);
    const r = insertChainBefore(e,'p',['x1','x2']);
    check('offshoots become prerequisites of the parent',
        S(r) === S(E(['a','x1'],['x1','x2'],['x2','p'],['p','z'])), S(r));
    check('parent keeps its outgoing edge', r.some(x=>x.from==='p'&&x.to==='z'));
    assertAcyclic('parent survives', r, nodesOf(r));
}
{
    const e = E(['p','z']);            // parent is the root -> chain becomes new root
    const r = insertChainBefore(e,'p',['x1']);
    check('root parent survives, chain leads in', S(r) === S(E(['x1','p'],['p','z'])), S(r));
    check('chain head is the new root', S(graphRoots(r, nodesOf(r))) === S([]) || graphRoots(r,nodesOf(r))[0]==='x1');
}

console.log('\n== reported bug: repeated splits never overlap ==');
{
    // Reproduce: split a star into 3, split one of those, split again.
    let edges = E(['s1','s2'],['s2','s3'],['s3','s4']);
    let live = ['s1','s2','s3','s4'];

    // split s2 (consumed) into a,b,c
    edges = replaceNodeWithChain(edges,'s2',['a','b','c']);
    live = live.filter(x=>x!=='s2').concat(['a','b','c']);
    assertNoDangling('after split 1', edges, live);

    // split b (consumed) into d,e
    edges = replaceNodeWithChain(edges,'b',['d','e']);
    live = live.filter(x=>x!=='b').concat(['d','e']);
    assertNoDangling('after split 2', edges, live);

    // split d (survives, keeps a step) into f,g
    edges = insertChainBefore(edges,'d',['f','g']);
    live = live.concat(['f','g']);
    assertNoDangling('after split 3', edges, live);
    assertAcyclic('after 3 splits', edges, live);

    const pos = computeLayout(edges, live, { seedKey: 'c0:' });
    const min = minPairDistance(pos);
    check(`3 chained splits: min separation ${min.toFixed(2)} >= ${LAYOUT_DEFAULTS.minSeparation}`,
        min >= LAYOUT_DEFAULTS.minSeparation - 0.01, `got ${min.toFixed(3)}`);
    check('sequence still a single chain (one root, one tail)',
        graphRoots(edges,live).length===1 && graphTails(edges,live).length===1,
        `roots=${graphRoots(edges,live)} tails=${graphTails(edges,live)}`);
}

console.log('\n== reported bug: deleting a parent with multiple splits ==');
{
    // parent p split into 3, then p deleted -> the 3 must not co-locate
    let edges = E(['s1','p'],['p','s3']);
    edges = replaceNodeWithChain(edges,'p',['x1','x2','x3']);
    const live = ['s1','s3','x1','x2','x3'];
    assertNoDangling('parent deleted w/ 3 offshoots', edges, live);
    const pos = computeLayout(edges, live, { seedKey: 'c0:' });
    const min = minPairDistance(pos);
    check(`offshoots occupy distinct positions (min ${min.toFixed(2)})`,
        min >= LAYOUT_DEFAULTS.minSeparation - 0.01, `got ${min.toFixed(3)}`);
    // they must be sequential, not co-ranked (the old fan bug)
    const rank = topoRank(edges, live);
    check('offshoots are sequenced, not fanned',
        rank.get('x1') < rank.get('x2') && rank.get('x2') < rank.get('x3'),
        JSON.stringify([...rank]));
}

console.log('\n== drag reorder round-trip ==');
{
    // a->b->c->d ; drag c to sit between a and b
    const edges = E(['a','b'],['b','c'],['c','d']);
    const ids = ['a','b','c','d'];
    const moveSet = dragMoveSet(edges,'c',ids);
    check('chain link drags alone (dominatedSet would wrongly take d)',
        moveSet.size===1 && moveSet.has('c'),
        `dragMoveSet=${[...moveSet]} dominatedSet=${[...dominatedSet(edges,'c',ids)]}`);
    const detached = spliceOutNode(edges,'c',moveSet);
    check('c detached, b joined to d', S(detached)===S(E(['a','b'],['b','d'])), S(detached));
    const r = insertIntoEdge(detached, {from:'a',to:'b'}, 'c');
    check('c now sits between a and b', S(r)===S(E(['a','c'],['c','b'],['b','d'])), S(r));
    assertAcyclic('reorder', r, ids);
    const rank = topoRank(r, ids);
    check('new order is a,c,b,d',
        rank.get('a')===0 && rank.get('c')===1 && rank.get('b')===2 && rank.get('d')===3,
        JSON.stringify([...rank]));
}
{
    // dragging a star that owns a branch takes the branch along
    const edges = E(['a','b'],['b','c'],['c','d'],['b','x'],['x','y']);
    const ids = ['a','b','c','d','x','y'];
    const moveSet = dragMoveSet(edges,'b',ids);
    check('fork point drags its whole branch {b,c,d,x,y}', moveSet.size===5, [...moveSet].join(','));
    const chainLink = dragMoveSet(edges,'x',ids);
    check('non-fork inside a branch drags alone', chainLink.size===1, [...chainLink].join(','));
}

console.log('\n== cycle rejection on reorder ==');
{
    const edges = E(['a','b'],['b','c'],['c','d']);
    const detached = spliceOutNode(edges,'b',new Set(['b']));
    // try to insert b into edge c->d  (fine), then attempt an illegal back-link
    const ok = insertIntoEdge(detached,{from:'c',to:'d'},'b');
    assertAcyclic('legal reinsert', ok, ['a','b','c','d']);
    check('back-edge d->a rejected (a already reaches d)', wouldCreateCycle(ok,'d','a')===true);
    check('back-edge d->c does cycle', wouldCreateCycle(ok,'d','c')===true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
