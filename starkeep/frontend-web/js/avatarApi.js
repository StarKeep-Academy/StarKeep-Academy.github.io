import { apiClient } from './api.js';

export const avatarApi = {
    getAvatar: (id) => apiClient.get(`/avatars/${id}`),
    updateAvatar: (id, body) => apiClient.patch(`/avatars/${id}`, body)
};
