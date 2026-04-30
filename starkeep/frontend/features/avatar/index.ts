/**
 * features/avatar/index.ts
 *
 * Avatar feature barrel.
 * Exports: types, api functions, React Query hooks.
 *
 * VR NOTE (DEC-006): AvatarProfile type mirrors the stable JSON contract
 * from API_CONTRACT.md. Field names here must match the backend exactly.
 * Add fields freely; never rename.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HeroicPath {
  slug:            string;   // e.g. "dreamwalker"
  display_name:    string;   // e.g. "Dreamwalker"
  campus:          string;   // e.g. "Soul Campus"
  campus_insignia: string;   // e.g. "star_tetrahedron"
  glyph_url:       string;   // SVG URL — future: glTF URL for VR
}

export interface LearningPath {
  slug:         string;
  display_name: string;
  glyph_url:    string;
}

export interface ArchetypeProfile {
  sun_sign:    string;           // Image 7 ASTRO column
  moon_sign:   string;
  rising_sign: string;
  jung_archetype: string;        // Image 7 JUNG column
  mbti:           string;        // Image 7 MBTI column
  recommended_heroic_path:   string;
  recommended_learning_path: string;
  purpose_seed:    string;
  visionary_trait: string;       // Image 7 right panel body text
  divergent_trait: string;
}

export interface ImpactSource {
  label: string;   // e.g. "Bachelors Degree in Digital Futures"
  hours: number;
}

// VR-stable contract — field names never change (DEC-006)
export interface AvatarProfile {
  id:            string;
  alias:         string;         // e.g. "DREAMWALKER" — displayed in ALL CAPS
  display_name:  string;         // e.g. "Ryan Boyd"
  level:         number;         // e.g. 700
  heroic_path:   HeroicPath | null;   // null until set after quiz (DEC-012)
  learning_path: LearningPath | null; // null until set after quiz
  purpose:       string;
  powers:        string[];
  archetype:     ArchetypeProfile | null;
  hours_of_impact: number;
  impact_sources:  ImpactSource[];
  created_at:    string;
  updated_at:    string;
}

export interface AvatarUpdatePayload {
  alias?:         string;
  display_name?:  string;
  purpose?:       string;
  heroic_path?:   string;
  learning_path?: string;
}

// ─── API Functions ────────────────────────────────────────────────────────────
export const avatarApi = {
  getById: (id: string) =>
    apiClient.get<AvatarProfile>(`/avatars/${id}`),

  update: (id: string, payload: AvatarUpdatePayload) =>
    apiClient.patch<AvatarProfile>(`/avatars/${id}`, payload),

  getArchetype: (id: string) =>
    apiClient.get<ArchetypeProfile>(`/avatars/${id}/archetype`),
};

// ─── Query Keys ───────────────────────────────────────────────────────────────
export const avatarKeys = {
  all:       ['avatars']                              as const,
  detail:    (id: string) => ['avatars', id]          as const,
  archetype: (id: string) => ['avatars', id, 'archetype'] as const,
};

// ─── React Query Hooks ────────────────────────────────────────────────────────
export function useAvatar(id: string) {
  return useQuery({
    queryKey: avatarKeys.detail(id),
    queryFn:  () => avatarApi.getById(id),
    enabled:  !!id,
    staleTime: 1000 * 60 * 5,  // 5 minutes
  });
}

export function useUpdateAvatar(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AvatarUpdatePayload) => avatarApi.update(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(avatarKeys.detail(id), updated);
    },
  });
}

export function useArchetype(id: string) {
  return useQuery({
    queryKey: avatarKeys.archetype(id),
    queryFn:  () => avatarApi.getArchetype(id),
    enabled:  !!id,
    staleTime: 1000 * 60 * 60,  // 1 hour — archetype data rarely changes
  });
}
