import { API_BASE } from './config.js';

// Namespaced (not just "access_token") so this never collides if frontend-web
// and the mobile app's own web build are ever hosted under the same origin —
// each writes to its own localStorage keys.
const ACCESS_TOKEN_KEY = 'starkeep_web_access_token';
const REFRESH_TOKEN_KEY = 'starkeep_web_refresh_token';

export const tokenStorage = {
    getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
    getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
    setTokens: (access, refresh) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, access);
        localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    },
    clearTokens: () => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
};

export class ApiError extends Error {
    constructor(status, title, detail, invalidParams) {
        super(detail);
        this.name = 'ApiError';
        this.status = status;
        this.title = title;
        this.invalidParams = invalidParams;
    }
}

async function parseResponse(response) {
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
        const errors = json?.errors;
        throw new ApiError(
            response.status,
            errors?.title ?? 'Error',
            errors?.detail ?? 'An unexpected error occurred.',
            errors?.invalid_params
        );
    }

    // Every Starkeep response wraps its payload: { data, meta, errors }.
    return json.data;
}

async function tryRefreshToken() {
    const refresh = tokenStorage.getRefreshToken();
    if (!refresh) return false;

    try {
        const response = await fetch(`${API_BASE}/auth/token/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh })
        });
        if (!response.ok) return false;

        const json = await response.json();
        // TokenRefreshView only returns a fresh `access` token unless simplejwt's
        // ROTATE_REFRESH_TOKENS also issues a new refresh — keep the old one
        // when it doesn't, rather than overwriting it with undefined.
        tokenStorage.setTokens(json.data.access, json.data.refresh ?? refresh);
        return true;
    } catch {
        return false;
    }
}

async function request(path, options = {}) {
    const { skipAuth = false, ...fetchOptions } = options;
    const headers = {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers || {})
    };

    if (!skipAuth) {
        const token = tokenStorage.getAccessToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });

    // One silent refresh-and-retry on expiry, matching the mobile app's client.
    if (response.status === 401 && !skipAuth) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
            const newToken = tokenStorage.getAccessToken();
            if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
            const retryResponse = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
            return parseResponse(retryResponse);
        }
        tokenStorage.clearTokens();
        throw new ApiError(401, 'Unauthorized', 'Session expired. Please sign in again.');
    }

    return parseResponse(response);
}

export const apiClient = {
    get: (path, options) => request(path, { method: 'GET', ...options }),
    post: (path, body, options) => request(path, { method: 'POST', body: JSON.stringify(body), ...options }),
    patch: (path, body, options) => request(path, { method: 'PATCH', body: JSON.stringify(body), ...options }),
    delete: (path, options) => request(path, { method: 'DELETE', ...options })
};

// Matches backend/apps/users/views.py exactly — RegisterView and LoginView
// both return { access, refresh, user_id, email, avatar }, not the
// `avatar_id`-only shape shown in docs/FRONTEND_API_INTEGRATION.md's example.
export const authApi = {
    register: ({ email, password, displayName }) =>
        apiClient.post('/auth/register', { email, password, display_name: displayName }, { skipAuth: true }),
    login: ({ email, password }) =>
        apiClient.post('/auth/login', { email, password }, { skipAuth: true }),
    logout: () => apiClient.post('/auth/logout'),
    me: () => apiClient.get('/auth/me')
};
