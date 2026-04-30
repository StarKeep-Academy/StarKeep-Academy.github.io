/**
 * features/auth/index.ts
 *
 * Auth API functions. All other features call apiClient directly;
 * auth goes through here so token storage is always handled consistently.
 */

import { apiClient } from '../../lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthAvatar {
  id:            string;
  alias:         string;
  display_name:  string;
  level:         number;
  heroic_path:   string | null;
  learning_path: string | null;
  has_archetype: boolean;
}

/** Shape returned by POST /auth/register and POST /auth/login */
export interface AuthResponse {
  access:   string;
  refresh:  string;
  user_id:  string;
  email:    string;
  avatar:   AuthAvatar | null;
}

export interface RegisterPayload {
  email:         string;
  password:      string;
  display_name?: string;
}

export interface LoginPayload {
  email:    string;
  password: string;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export const authApi = {
  register: (payload: RegisterPayload) =>
    apiClient.post<AuthResponse>('/auth/register', payload, { skipAuth: true }),

  login: (payload: LoginPayload) =>
    apiClient.post<AuthResponse>('/auth/login', payload, { skipAuth: true }),

  logout: (refreshToken: string) =>
    apiClient.post<void>('/auth/logout', { refresh: refreshToken }),
};
