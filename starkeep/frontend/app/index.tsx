/**
 * app/index.tsx
 *
 * Root redirect. Expo Router serves this at "/".
 * DEC-011: unauthenticated → /splash, authenticated → /(shell)/menu.
 */

import { Redirect } from 'expo-router';
import { useAuthStore } from '../features/auth/store';

export default function Index() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return <Redirect href={isAuthenticated ? '/(shell)/menu' : '/splash'} />;
}
