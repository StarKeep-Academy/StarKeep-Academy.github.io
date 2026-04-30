/**
 * lib/api-client.ts
 *
 * Single HTTP client for all API calls.
 * Handles: auth headers, token refresh, envelope unwrapping, error mapping.
 *
 * Features never import fetch() directly. They import apiClient.
 * VR clients would have their own equivalent of this file.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

// ─── Token Storage ────────────────────────────────────────────────────────────
// SecureStore is native-only. On web we fall back to localStorage.
const store = {
  get: (key: string): Promise<string | null> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.getItem(key))
      : SecureStore.getItemAsync(key),

  set: (key: string, value: string): Promise<void> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.setItem(key, value))
      : SecureStore.setItemAsync(key, value),

  del: (key: string): Promise<void> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.removeItem(key))
      : SecureStore.deleteItemAsync(key),
};

export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    return store.get('access_token');
  },
  async setTokens(access: string, refresh: string): Promise<void> {
    await store.set('access_token', access);
    await store.set('refresh_token', refresh);
  },
  async getRefreshToken(): Promise<string | null> {
    return store.get('refresh_token');
  },
  async clearTokens(): Promise<void> {
    await store.del('access_token');
    await store.del('refresh_token');
  },
};

// ─── Error Types ──────────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail: string,
    public invalidParams?: Array<{ field: string; message: string }>,
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

export class NotImplementedError extends ApiError {
  constructor() {
    super(501, 'Not Implemented', 'This feature is coming in a future release.');
  }
}

// ─── Core Fetch ───────────────────────────────────────────────────────────────
interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = await tokenStorage.getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });

  // Handle token expiry with one silent refresh
  if (response.status === 401 && !skipAuth) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry original request with new token
      const newToken = await tokenStorage.getAccessToken();
      if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
      const retryResponse = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
      return parseResponse<T>(retryResponse);
    }
    // Refresh failed — clear tokens and let the auth gate handle redirect
    await tokenStorage.clearTokens();
    throw new ApiError(401, 'Unauthorized', 'Session expired. Please sign in again.');
  }

  return parseResponse<T>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const json = await response.json();

  if (!response.ok) {
    const errors = json?.errors;
    throw new ApiError(
      response.status,
      errors?.title ?? 'Error',
      errors?.detail ?? 'An unexpected error occurred.',
      errors?.invalid_params,
    );
  }

  // Unwrap the Starkeep envelope: return json.data
  return json.data as T;
}

async function tryRefreshToken(): Promise<boolean> {
  const refresh = await tokenStorage.getRefreshToken();
  if (!refresh) return false;

  try {
    const response = await fetch(`${API_BASE}/auth/token/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });

    if (!response.ok) return false;

    const json = await response.json();
    await tokenStorage.setTokens(json.data.access, json.data.refresh);
    return true;
  } catch {
    return false;
  }
}

// ─── HTTP Methods ─────────────────────────────────────────────────────────────
export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: 'GET', ...options }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), ...options }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body), ...options }),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body), ...options }),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: 'DELETE', ...options }),
};
