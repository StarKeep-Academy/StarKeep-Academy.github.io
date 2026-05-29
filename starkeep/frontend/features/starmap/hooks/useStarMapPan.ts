/**
 * features/starmap/hooks/useStarMapPan.ts
 *
 * Pan + tap gesture handling for the Star Map canvas.
 * Uses react-native-gesture-handler PanGestureHandler.
 *
 * Smooth lerp pan toward target is driven by a setInterval
 * (60fps equivalent) since we no longer have Skia's clock.
 *
 * Exports:
 *   panX, panY            — current animated pan offset (Animated.Value)
 *   panTargetRef          — ref to target pan position (set by navigation)
 *   panHandlers           — spread onto PanGestureHandler
 *   setPanTarget(x, y)    — smoothly pan to a world position
 */

import { useRef, useEffect } from 'react';
import { Animated } from 'react-native';
import {
  PanGestureHandler,
  State,
  GestureHandlerStateChangeEvent,
  PanGestureHandlerEventPayload,
  HandlerStateChangeEvent,
} from 'react-native-gesture-handler';

export function useStarMapPan() {
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;

  // Raw numeric refs for lerp calculations
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const panTXRef = useRef(0);
  const panTYRef = useRef(0);

  // Track whether user is actively dragging
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);

  // Lerp loop — runs at ~60fps toward panTarget
  useEffect(() => {
    const id = setInterval(() => {
      if (isDragging.current) return;
      const dx = panTXRef.current - panXRef.current;
      const dy = panTYRef.current - panYRef.current;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        panXRef.current += dx * 0.1;
        panYRef.current += dy * 0.1;
        panX.setValue(panXRef.current);
        panY.setValue(panYRef.current);
      } else if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        panXRef.current = panTXRef.current;
        panYRef.current = panTYRef.current;
        panX.setValue(panXRef.current);
        panY.setValue(panYRef.current);
      }
    }, 16); // ~60fps
    return () => clearInterval(id);
  }, []);

  function setPanTarget(tx: number, ty: number) {
    panTXRef.current = tx;
    panTYRef.current = ty;
  }

  // Gesture handler state — track translation
  const lastPanX = useRef(0);
  const lastPanY = useRef(0);

  const onGestureEvent = (event: any) => {
    if (isDragging.current) {
      const nx = lastPanX.current + event.nativeEvent.translationX;
      const ny = lastPanY.current + event.nativeEvent.translationY;
      panXRef.current = nx;
      panYRef.current = ny;
      panTXRef.current = nx;
      panTYRef.current = ny;
      panX.setValue(nx);
      panY.setValue(ny);
    }
  };

  const onHandlerStateChange = (event: any) => {
    const { state, translationX, translationY } = event.nativeEvent;
    if (state === State.BEGAN) {
      isDragging.current = true;
      lastPanX.current = panXRef.current;
      lastPanY.current = panYRef.current;
    }
    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      isDragging.current = false;
      lastPanX.current = panXRef.current;
      lastPanY.current = panYRef.current;
    }
  };

  return {
    panX, panY,
    panXRef, panYRef,
    panTXRef, panTYRef,
    setPanTarget,
    onGestureEvent,
    onHandlerStateChange,
  };
}
