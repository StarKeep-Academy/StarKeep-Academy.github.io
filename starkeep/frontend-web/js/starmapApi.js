import { apiClient } from './api.js';

export const starmapApi = {
    getStarMap: (avatarId) => apiClient.get(`/star-maps/${avatarId}`),

    createMilestone: (body) => apiClient.post('/milestones', body),
    updateMilestone: (id, body) => apiClient.patch(`/milestones/${id}`, body),
    deleteMilestone: (id) => apiClient.delete(`/milestones/${id}`),
    addEvidence: (id, body) => apiClient.post(`/milestones/${id}/evidence`, body),
    submitMilestone: (id) => apiClient.post(`/milestones/${id}/submit`, {}),
    splitMilestone: (id, body) => apiClient.post(`/milestones/${id}/split`, body),

    createConstellation: (body) => apiClient.post('/constellations', body),
    deleteConstellation: (id) => apiClient.delete(`/constellations/${id}`),
    replaceEdges: (constellationId, edges) =>
        apiClient.post(`/constellations/${constellationId}/edges`, { edges })
};

/**
 * Maps GET /star-maps/{avatar_id}'s nested tree response onto the flat
 * shapes StarMapView.js already works with (localStarData/
 * localConstellationConfig/edges-by-constellation) — the same shapes it
 * seeds from constants.js's mock STAR_DATA/CONSTELLATION_CONFIG today, so
 * nothing downstream (starGraph.js, the 3D rendering, layout) needs to
 * change to know about the network.
 *
 * The tree splits milestones into two places by status — approved ones
 * live under constellation_paths[].constellations[].stars, everything else
 * (pending/active/submitted/rejected) is a flat pending_milestones list
 * tagged with constellation_id — so both are combined here into one flat
 * localStarData array, mirroring how STAR_DATA already mixes all statuses
 * together regardless of status.
 */
export function mapStarMapResponse(apiData) {
    const localStarData = [];
    const localConstellationConfig = [];
    const edgesByConstellationId = new Map();

    (apiData.constellation_paths || []).forEach((path) => {
        (path.constellations || []).forEach((c) => {
            localConstellationConfig.push({
                id: c.id,
                name: c.name,
                angle_deg: c.angle_deg,
                radius: c.radius,
                tilt_deg: c.tilt_deg ?? 0,
                hint: c.symbol ?? ''
            });
            edgesByConstellationId.set(c.id, (c.edges || []).map((e) => ({ from: e.from, to: e.to })));
            (c.stars || []).forEach((s) => localStarData.push(mapApprovedStarToLocal(s, c.id)));
        });
    });

    (apiData.pending_milestones || []).forEach((m) => {
        if (!m.constellation_id) return; // not attached to any constellation yet — nothing to render
        localStarData.push(mapPendingMilestoneToLocal(m));
    });

    return { localStarData, localConstellationConfig, edgesByConstellationId };
}

function mapApprovedStarToLocal(apiStar, constellationId) {
    return {
        id: apiStar.id,
        constellationId,
        title: apiStar.title,
        description: apiStar.description ?? '',
        status: 'approved',
        lux: apiStar.lux_issued,
        completedDate: apiStar.completed_at,
        planets: apiStar.planets ?? [],
        evidence: mapEvidence(apiStar.evidence),
        // DEC-013 amendment: saved placement, null until a star has been
        // explicitly positioned — layoutConstellation() falls back to
        // procedural layout only when these are null.
        x: apiStar.x ?? null,
        y: apiStar.y ?? null,
        z: apiStar.z ?? null
    };
}

function mapPendingMilestoneToLocal(apiMilestone) {
    return {
        id: apiMilestone.id,
        constellationId: apiMilestone.constellation_id,
        title: apiMilestone.title,
        description: apiMilestone.description ?? '',
        status: apiMilestone.status,
        planets: apiMilestone.planets ?? [],
        evidence: mapEvidence(apiMilestone.evidence),
        x: apiMilestone.x ?? null,
        y: apiMilestone.y ?? null,
        z: apiMilestone.z ?? null
    };
}

function mapEvidence(apiEvidence) {
    // Mock evidence entries are just {label}; real Evidence rows are
    // {id, type, payload, label} — a strict superset, so anything reading
    // only .label (the current UI) keeps working unchanged.
    return (apiEvidence ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        payload: e.payload,
        label: e.label || e.payload
    }));
}
