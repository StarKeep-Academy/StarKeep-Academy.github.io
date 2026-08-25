import { apiClient } from './api.js';

/**
 * External integrations (DEC-014).
 *
 * The archetype quiz lives in a separate repo on its own host with its own
 * accounts, so it cannot read our session. launchQuiz() asks the backend to
 * mint a single-use ticket and returns the URL to send the browser to; the
 * quiz's *backend* redeems that ticket server-side for the user's identity
 * and starts its own session.
 *
 * Deliberately no quiz URL here — the backend owns it (QUIZ_REPO_BASE_URL),
 * because it also has to be the thing that signs the handoff. Hardcoding it
 * client-side is what made the old button unable to carry an identity at all.
 */
export const integrationsApi = {
    /**
     * @param {string} returnTo Site-relative path to come back to. The server
     *   rejects anything absolute or protocol-relative, so this cannot be
     *   pointed at another origin.
     * @returns {Promise<{launch_url: string, expires_at: string}>}
     */
    launchQuiz: (returnTo = '/avatar') =>
        apiClient.post('/integrations/quiz/launch', { return_to: returnTo })
};
