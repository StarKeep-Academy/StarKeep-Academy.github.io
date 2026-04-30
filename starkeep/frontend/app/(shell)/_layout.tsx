/**
 * app/(shell)/_layout.tsx
 *
 * Authenticated shell — Stack navigator.
 *
 * Navigation flow:
 *   /(shell)/menu  →  push  →  /(shell)/avatar | star-maps | academy | lux | settings
 *   content page   →  back  →  /(shell)/menu
 *
 * The menu page (RadialNav) is a dedicated full-screen route, not an overlay.
 * Content pages have their own HOME button that calls router.back().
 *
 * DEC-011: Unauthenticated users are redirected to /splash.
 * DEC-002: Route names match wireframe canon exactly.
 */

import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '../../features/auth/store';

export default function ShellLayout() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  // DEC-011: Unauthenticated users cannot see any shell routes
  if (!isAuthenticated) return <Redirect href="/splash" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="menu" />
      <Stack.Screen name="avatar/index" />
      <Stack.Screen name="avatar/quiz" />
      <Stack.Screen name="star-maps/index" />
      <Stack.Screen name="academy/index" />
      <Stack.Screen name="lux/index" />
      <Stack.Screen name="mission-log/index" />
      <Stack.Screen name="settings/index" />
    </Stack>
  );
}
