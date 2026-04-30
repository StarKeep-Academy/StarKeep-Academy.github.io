/**
 * app/_layout.tsx
 *
 * Root layout. Handles:
 * - Font loading (Syncopate display font, SpaceMono mono)
 * - QueryClient provider (React Query)
 * - Auth gate: unauthenticated → /splash
 * - Authenticated → /(shell)/menu (default landing, DEC-011)
 */

import { useEffect, useState } from 'react';
import { SplashScreen, Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Syncopate_400Regular, Syncopate_700Bold } from '@expo-google-fonts/syncopate';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono/400Regular';
import { useAuthStore } from '../features/auth/store';

// Prevent native splash screen from auto-hiding before fonts + auth are ready
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Syncopate:        Syncopate_400Regular,
    'Syncopate-Bold': Syncopate_700Bold,
    SpaceMono:        SpaceMono_400Regular,
  });

  const [authReady, setAuthReady] = useState(false);
  const hydrate = useAuthStore(s => s.hydrate);

  // Restore session from SecureStore on every cold boot
  useEffect(() => {
    hydrate().finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (fontsLoaded && authReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, authReady]);

  // Keep native splash visible until both fonts and auth state are resolved
  if (!fontsLoaded || !authReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
