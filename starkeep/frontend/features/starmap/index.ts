/**
 * features/starmap/index.ts
 *
 * Star Map feature barrel.
 * Types mirror API_CONTRACT.md /star-maps/ section exactly.
 *
 * VR NOTE (DEC-006): Star, Constellation, and milestone placement
 * data (x, y) are served to VR clients. Field names are stable.
 * z coordinate will be added as optional field when VR client needs it.
 *
 * Vocabulary (from STARKEEP_CONTEXT.md §2):
 *   Milestone = pending task (not yet done)
 *   Star      = completed milestone (the achievement badge)
 *   Constellation = cluster of completed Stars
 *   The UI shows both: pending milestones as waypoints + approved ones as stars
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
export type MilestoneStatus = 'pending' | 'active' | 'submitted' | 'approved' | 'rejected';
export type EvidenceType = 'photo' | 'video' | 'text' | 'link' | 'certificate';

export interface Star {
  id:           string;
  title:        string;
  completed_at: string;
  lux_issued:   number;
  x:            number;    // 0.0–1.0 placement hint
  y:            number;    // 0.0–1.0 placement hint
  // z will be added when VR client requests it (no breaking change)
}

export interface Constellation {
  id:           string;
  name:         string;
  symbol:       string;    // e.g. "wolf" — becomes the visual myth in the sky
  completed_at: string | null;
  stars:        Star[];
}

export interface ConstellationPath {
  id:             string;
  name:           string;
  constellations: Constellation[];
}

export interface PendingMilestone {
  id:                string;
  title:             string;
  status:            MilestoneStatus;
  validation_status: string;
  constellation_id:  string | null;
  rejection_feedback?: string;
}

// VR-stable root object
export interface StarMap {
  avatar_id:            string;
  total_stars:          number;
  total_constellations: number;
  constellation_paths:  ConstellationPath[];
  pending_milestones:   PendingMilestone[];
}

export interface Evidence {
  type:    EvidenceType;
  payload: string;         // text content or URL
  label?:  string;
}

export interface CreateMilestonePayload {
  title:            string;
  description?:     string;
  constellation_id?: string;
}

export interface UpdateMilestonePayload {
  title?:            string;
  description?:      string;
  constellation_id?: string;
  status?:           'pending' | 'active';
}

// ─── API Functions ────────────────────────────────────────────────────────────
export const starmapApi = {
  getStarMap: (avatarId: string) =>
    apiClient.get<StarMap>(`/star-maps/${avatarId}`),

  getMilestones: (params?: { status?: MilestoneStatus; page?: number }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.page)   search.set('page', String(params.page));
    return apiClient.get<PendingMilestone[]>(`/milestones?${search}`);
  },

  createMilestone: (payload: CreateMilestonePayload) =>
    apiClient.post<PendingMilestone>('/milestones', payload),

  updateMilestone: (id: string, payload: UpdateMilestonePayload) =>
    apiClient.patch<PendingMilestone>(`/milestones/${id}`, payload),

  submitForValidation: (id: string) =>
    apiClient.post<PendingMilestone>(`/milestones/${id}/submit`),

  addEvidence: (milestoneId: string, evidence: Evidence) =>
    apiClient.post<Evidence>(`/milestones/${milestoneId}/evidence`, evidence),
};

// ─── Query Keys ───────────────────────────────────────────────────────────────
export const starmapKeys = {
  all:       ['starmap']                                          as const,
  map:       (avatarId: string) => ['starmap', avatarId]        as const,
  milestones: (filters?: object) => ['milestones', filters]     as const,
  milestone:  (id: string) => ['milestones', id]                as const,
};

// ─── React Query Hooks ────────────────────────────────────────────────────────
export function useStarMap(avatarId: string) {
  return useQuery({
    queryKey: starmapKeys.map(avatarId),
    queryFn:  () => starmapApi.getStarMap(avatarId),
    enabled:  !!avatarId,
    staleTime: 1000 * 60 * 2,  // 2 minutes — star map updates frequently
  });
}

export function useCreateMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: starmapApi.createMilestone,
    onSuccess: () => {
      // Invalidate the full star map to refetch
      queryClient.invalidateQueries({ queryKey: starmapKeys.all });
    },
  });
}

export function useSubmitMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => starmapApi.submitForValidation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: starmapKeys.all });
    },
  });
}
