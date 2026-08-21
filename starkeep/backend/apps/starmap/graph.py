"""
apps/starmap/graph.py

Server-side ports of the pure edge-graph helpers in frontend-web's
js/starGraph.js (DEC-013). Kept deliberately line-for-line equivalent to
that file so the client (which computes edge lists interactively during a
drag/mitosis preview) and the server (which is the final authority on what
actually gets persisted) can never disagree about the rewiring rules.

Edge shape everywhere here: a list of dicts {"from": id, "to": id}, ids as
strings (UUIDs stringified) — matches the wire format exactly, no ORM
objects. See frontend-web/js/starGraph.js for the original implementations
and their docstrings/rationale.
"""


def edges_without(edges, star_id):
    """Drop every edge touching star_id. Used when a star is deleted/consumed."""
    return [e for e in edges if e["from"] != star_id and e["to"] != star_id]


def normalize_edges(edges):
    """De-duplicate, and drop any self-edges that slipped through."""
    seen = set()
    result = []
    for e in edges:
        if e["from"] == e["to"]:
            continue
        key = (e["from"], e["to"])
        if key in seen:
            continue
        seen.add(key)
        result.append({"from": e["from"], "to": e["to"]})
    return result


def splice_out_node(edges, node_id, move_set=None):
    """
    Pull node_id (and anything travelling with it in move_set) out of the
    sequence, healing the gap: every predecessor is joined to every
    successor, so removing a star from the middle of a chain closes it
    rather than severing it.
    """
    if move_set is None:
        move_set = {node_id}

    preds = [e["from"] for e in edges if e["to"] == node_id and e["from"] not in move_set]
    succs = [e["to"] for e in edges if e["from"] == node_id and e["to"] not in move_set]

    kept = [
        e for e in edges
        if (e["from"] in move_set and e["to"] in move_set)
        or (e["from"] != node_id and e["to"] != node_id)
    ]
    for frm in preds:
        for to in succs:
            kept.append({"from": frm, "to": to})
    return normalize_edges(kept)


def chain_edges(ids):
    """Chain ids head-to-tail: ids[0] -> ids[1] -> ..."""
    return [{"from": ids[i], "to": ids[i + 1]} for i in range(len(ids) - 1)]


def replace_node_with_chain(edges, node_id, chain_ids):
    """
    Mitosis, parent consumed: the chain takes over the parent's slot
    entirely. Everything that pointed at the parent points at the head of
    the chain; everything the parent pointed at hangs off its tail. No edge
    is left referencing the removed star.
    """
    if not chain_ids:
        return edges_without(edges, node_id)
    head = chain_ids[0]
    tail = chain_ids[-1]
    incoming = [e["from"] for e in edges if e["to"] == node_id]
    outgoing = [e["to"] for e in edges if e["from"] == node_id]

    next_edges = edges_without(edges, node_id) + chain_edges(chain_ids)
    for frm in incoming:
        if frm != node_id:
            next_edges.append({"from": frm, "to": head})
    for to in outgoing:
        if to != node_id:
            next_edges.append({"from": tail, "to": to})
    return normalize_edges(next_edges)


def insert_chain_before(edges, node_id, chain_ids):
    """
    Mitosis, parent survives: the chain splices in AHEAD of the parent as
    its prerequisites. The parent's predecessors now lead into the chain,
    and the chain leads into the parent; its outgoing edges are untouched,
    so it holds its place in the sequence.
    """
    if not chain_ids:
        return normalize_edges(edges)
    head = chain_ids[0]
    tail = chain_ids[-1]
    incoming = [e["from"] for e in edges if e["to"] == node_id]

    next_edges = [e for e in edges if e["to"] != node_id] + chain_edges(chain_ids)
    for frm in incoming:
        next_edges.append({"from": frm, "to": head})
    next_edges.append({"from": tail, "to": node_id})
    return normalize_edges(next_edges)


def find_cycle(edges):
    """
    DFS 3-color cycle check. Returns the id of a node involved in a cycle,
    or None if the edge list is acyclic. Defense in depth for
    ConstellationEdgesView — the client already validates this, but the
    server must never trust that blindly.
    """
    from collections import defaultdict

    adjacency = defaultdict(list)
    for e in edges:
        adjacency[e["from"]].append(e["to"])

    WHITE, GRAY, BLACK = 0, 1, 2
    color = defaultdict(int)
    cycle_node = None

    def visit(node):
        nonlocal cycle_node
        color[node] = GRAY
        for nxt in adjacency[node]:
            if cycle_node is not None:
                return
            if color[nxt] == GRAY:
                cycle_node = nxt
                return
            if color[nxt] == WHITE:
                visit(nxt)
        color[node] = BLACK

    for n in list(adjacency.keys()):
        if cycle_node is not None:
            break
        if color[n] == WHITE:
            visit(n)

    return cycle_node
