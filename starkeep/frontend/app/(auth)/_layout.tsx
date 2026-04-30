/**
 * app/(auth)/_layout.tsx
 *
 * Auth route group. Redirects already-authenticated users straight to the shell.
 * DEC-011: unauthenticated users can only access /splash and /(auth)/*.
 */

import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '../../features/auth/store';

export default function AuthLayout() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  if (isAuthenticated) {
    return <Redirect href="/(shell)/avatar" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
