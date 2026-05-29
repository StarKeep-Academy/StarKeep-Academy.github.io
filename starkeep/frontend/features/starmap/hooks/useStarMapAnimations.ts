/**
 * features/starmap/hooks/useStarMapAnimations.ts
 *
 * All continuous animations for the Star Map.
 * Replaces Skia's useClock with React Native's Animated.loop.
 *
 * Exports:
 *   pulseAnim   — slow 0→1→0 cycle for star glow (period ~12s, 3x slower)
 *   orbitAnim   — 0→1 continuous rotation for orbiting planets (period ~8s)
 *   plusAnim    — 0→1→0 pulse for the + button glow (period ~3s)
 *   bgAnim      — 0→1 slow drift for background stars (period ~20s)
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

export function useStarMapAnimations() {
  const pulseAnim  = useRef(new Animated.Value(0)).current;
  const orbitAnim  = useRef(new Animated.Value(0)).current;
  const plusAnim   = useRef(new Animated.Value(0)).current;
  const bgAnim     = useRef(new Animated.Value(0)).current;
  const skyRotAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Star glow pulse — 12s period (3× slower than default 4s)
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1, duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0, duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    ).start();

    // Orbit rotation — full 360° every 8s
    Animated.loop(
      Animated.timing(orbitAnim, {
        toValue: 1, duration: 8000,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    ).start();

    // Plus button pulse — 3s period
    Animated.loop(
      Animated.sequence([
        Animated.timing(plusAnim, {
          toValue: 1, duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(plusAnim, {
          toValue: 0, duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    ).start();

    // Background star twinkle — 20s period
    Animated.loop(
      Animated.timing(bgAnim, {
        toValue: 1, duration: 20000,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    ).start();
    // Sky rotation — full 360° every 120s (very slow, full-sky view only)
    Animated.loop(
      Animated.timing(skyRotAnim, {
        toValue: 1, duration: 120000,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    ).start();
  }, []);

  return { pulseAnim, orbitAnim, plusAnim, bgAnim, skyRotAnim };
}
