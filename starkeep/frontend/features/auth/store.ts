/**
 * features/auth/store.ts
 *
 * The only global Zustand store.
 * Holds auth state. Everything else is server state via React Query.
 *
 * Persisted to SecureStore on native, httpOnly cookie on web (handled by apiClient).
 */

import { create } from 'zustand';
import { tokenStorage, apiClient } from '../../lib/api-client';

interface AuthUser {
  user_id:  string;
  email:    string;
  avatar: {
    id:           string;
    alias:        string;
    display_name: string;
    level:        number;
    heroic_path:  string;
    learning_path: string;
    has_archetype: boolean;
  };
}

interface AuthStore {
  isAuthenticated: boolean;
  user:            AuthUser | null;
  avatarId:        string | null;

  // Actions
  login:  (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;  // call on app boot to restore session
  devSeed: () => void;           // dev-only: bypass auth for frontend preview
}

export const useAuthStore = create<AuthStore>((set) => ({
  isAuthenticated: false,
  user:            null,
  avatarId:        null,

  login: async (accessToken, refreshToken) => {
    await tokenStorage.setTokens(accessToken, refreshToken);
    const user = await apiClient.get<AuthUser>('/auth/me');
    set({
      isAuthenticated: true,
      user,
      avatarId: user.avatar.id,
    });
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Best-effort logout
    }
    await tokenStorage.clearTokens();
    set({ isAuthenticated: false, user: null, avatarId: null });
  },

  hydrate: async () => {
    const token = await tokenStorage.getAccessToken();
    if (!token) return;
    try {
      const user = await apiClient.get<AuthUser>('/auth/me');
      set({ isAuthenticated: true, user, avatarId: user.avatar.id });
    } catch {
      await tokenStorage.clearTokens();
    }
  },

  devSeed: () => {
    const mockUser: AuthUser = {
      user_id: '00000000-0000-0000-0000-000000000001',
      email:   'dev@starkeep.io',
      avatar: {
        id:            '00000000-0000-0000-0000-000000000002',
        alias:         'DREAMWALKER',
        display_name:  'Dev User',
        level:         7,
        heroic_path:   'dreamwalker',
        learning_path: 'divergent',
        has_archetype: false,
      },
    };
    set({ isAuthenticated: true, user: mockUser, avatarId: mockUser.avatar.id });
  },
}));
