/**
 * features/starmap/components/StarMapCanvas.tsx
 *
 * REWRITTEN: uses react-native-svg + Animated API only.
 * No @shopify/react-native-skia dependency.
 *
 * Architecture:
 *   - SVG elements replace Canvas drawing calls
 *   - Animated.Value drives glow opacity, orbit angles
 *   - PanGestureHandler + TapGestureHandler handle interaction
 *   - AnimatedCircle / AnimatedG from Animated.createAnimatedComponent
 *
 * All visual features preserved:
 *   ✓ Background ambient stars (static, stagger opacity via index)
 *   ✓ Connector lines between stars
 *   ✓ Star nodes (4 status variants with glow)
 *   ✓ Slow pulse glow on stars (12s period, 3× slower)
 *   ✓ Orbiting planets (continuous rotation for incomplete)
 *   ✓ Locked planet indicator (static + glow ring for complete)
 *   ✓ North Star glyph with glow
 *   ✓ Constellation labels
 *   ✓ Faded remote constellations at zoom 2
 *   ✓ Pan to navigate sky
 *   ✓ Tap to enter constellation / expand star
 */

import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Animated, Easing } from 'react-native';
import Svg, {
  Circle, Line, Path, G, Text as SvgText, Defs, RadialGradient, Stop,
} from 'react-native-svg';
import {
  PanGestureHandler,
  TapGestureHandler,
  State,
} from 'react-native-gesture-handler';

import {
  useStarMapState,
  getConstPosition, STAR_OFFSETS,
  StarNode, Planet,
} from '../hooks/useStarMapState';
import { useStarMapAnimations } from '../hooks/useStarMapAnimations';
import { useStarMapPan }        from '../hooks/useStarMapPan';
import { colors } from '../../../design-system/tokens';

const SC = 2.2; // zoom-2 scale factor — DO NOT CHANGE (affects centering math)

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG      = Animated.createAnimatedComponent(G);

interface Props {
  state: ReturnType<typeof useStarMapState>;
  pan:   ReturnType<typeof useStarMapPan>;
  anims: ReturnType<typeof useStarMapAnimations>;
}

export function StarMapCanvas({ state, pan, anims }: Props) {
  const { width, height } = useWindowDimensions();

  // Numeric refs so gesture hit-testing can read current values synchronously
  const panXNum  = useRef(0);
  const panYNum  = useRef(0);
  const skyRotRef = useRef(0);

  useEffect(() => {
    const idX = pan.panX.addListener(({ value }) => { panXNum.current = value; });
    const idY = pan.panY.addListener(({ value }) => { panYNum.current = value; });
    const idR = anims.skyRotAnim.addListener(({ value }) => { skyRotRef.current = value; });
    return () => {
      pan.panX.removeListener(idX);
      pan.panY.removeListener(idY);
      anims.skyRotAnim.removeListener(idR);
    };
  }, [pan.panX, pan.panY, anims.skyRotAnim]);

  const CX = () => width  / 2 + panXNum.current;
  const CY = () => height / 2 + panYNum.current + 40;

  // ── Hit testing ────────────────────────────────────────────────────────────
  function handleTap(mx: number, my: number) {
    const x0 = CX(), y0 = CY();

    if (state.zoom === 1 && state.hasNorthStar) {
      if (dist(mx, my, x0, y0) < 26) {
        state.setShowNorthStarScreen(true);
        return;
      }
      const rotRad  = skyRotRef.current * Math.PI * 2;
      const vertBias = height / 6;
      for (let i = 0; i < state.constellations.length; i++) {
        const pos        = getConstPosition(i);
        const baseRad    = (pos.angle * Math.PI) / 180;
        const currentRad = baseRad + rotRad;
        const fx  = x0 + Math.cos(currentRad) * pos.r;
        const fy  = y0 + Math.sin(currentRad) * pos.r;
        if (dist(mx, my, fx, fy) < 70) {
          state.enterConstellation(i, vertBias);
          return;
        }
      }
      return;
    }

    if (state.zoom === 2 && state.selectedConst !== null) {
      const stars = state.getConstStars(state.selectedConst);
      const offs  = STAR_OFFSETS[state.selectedConst % 4];
      // Constellation centre in screen space = canvas-origin + radial offset (same as ConstLayer render)
      const cpos   = getConstPosition(state.selectedConst);
      const crad   = (cpos.angle * Math.PI) / 180;
      const constX = x0 + Math.cos(crad) * cpos.r;
      const constY = y0 + Math.sin(crad) * cpos.r;
      for (let j = 0; j < stars.length; j++) {
        const off = offs[j] ?? { x: 0, y: 0 };
        const sx  = constX + off.x * SC;
        const sy  = constY + off.y * SC;
        if (dist(mx, my, sx, sy) < 30) {
          if (state.expandedStar === stars[j].id) {
            state.closeStarPanel();
          } else {
            state.openStarPanel(stars[j].id, width, height / 6);
          }
          return;
        }
      }
    }
  }

  // ── Tap gesture ────────────────────────────────────────────────────────────
  const tapRef = useRef(null);

  // Shared hover logic — works from any event source (mouse, pan gesture)
  function updateHover(x: number, y: number) {
    const x0 = CX(), y0 = CY();

    if (state.zoom === 1 && state.hasNorthStar) {
      const rotRad = skyRotRef.current * Math.PI * 2;
      let hovered: number | null = null;
      for (let i = 0; i < state.constellations.length; i++) {
        const pos        = getConstPosition(i);
        const baseRad    = (pos.angle * Math.PI) / 180;
        const currentRad = baseRad + rotRad;
        const fx = x0 + Math.cos(currentRad) * pos.r;
        const fy = y0 + Math.sin(currentRad) * pos.r;
        if (dist(x, y, fx, fy) < 80) { hovered = i; break; }
      }
      if (hovered !== state.hoveredConst) state.setHoveredConst(hovered);

    } else if (state.zoom === 2 && state.selectedConst !== null) {
      const cpos   = getConstPosition(state.selectedConst);
      const crad   = (cpos.angle * Math.PI) / 180;
      const constX = x0 + Math.cos(crad) * cpos.r;
      const constY = y0 + Math.sin(crad) * cpos.r;
      const stars  = state.getConstStars(state.selectedConst) as StarNode[];
      const offs   = STAR_OFFSETS[state.selectedConst % 4];
      let hoveredStar: string | null = null;
      for (let j = 0; j < stars.length; j++) {
        const off = offs[j] ?? { x: 0, y: 0 };
        const sx = constX + off.x * SC;
        const sy = constY + off.y * SC;
        if (dist(x, y, sx, sy) < 30) { hoveredStar = stars[j].id; break; }
      }
      if (hoveredStar !== state.hoveredStar) state.setHoveredStar(hoveredStar);
    }
  }

  function clearHover() {
    if (state.hoveredConst !== null) state.setHoveredConst(null);
    if (state.hoveredStar  !== null) state.setHoveredStar(null);
  }

  // Web: pure mouse hover (no click required)
  const handleMouseMove = (e: any) => {
    const { pageX, pageY, clientX, clientY } = e.nativeEvent ?? e;
    updateHover(pageX ?? clientX, pageY ?? clientY);
  };
  const handleMouseLeave = () => clearHover();

  // Mobile: hover while dragging (wraps the pan Animated.event)
  const handlePanGestureEvent = (event: any) => {
    (pan.onGestureEvent as any)(event);
    const { x, y } = event.nativeEvent;
    updateHover(x, y);
  };
  const handlePanHandlerStateChange = (event: any) => {
    pan.onHandlerStateChange(event);
    const { state: gState } = event.nativeEvent;
    if (gState === State.END || gState === State.CANCELLED || gState === State.FAILED) {
      clearHover();
    }
  };

  // Tap: only fires handleTap on END (hover is handled by mouse/pan events above)
  const onTapStateChange = (event: any) => {
    const { state: gState, x, y } = event.nativeEvent;
    if (gState === State.END) {
      handleTap(x, y);
    }
  };

  // ── Derived animated values ────────────────────────────────────────────────
  const glowOpacity = anims.pulseAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.3, 0.9],
  });

  // Sky rotation values created here (stable parent) so SkyLayer remounts don't lose the animation
  const skyRotation = React.useMemo(() =>
    anims.skyRotAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 360] }),
    [anims.skyRotAnim]
  );
  const skyCounter = React.useMemo(() =>
    anims.skyRotAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -360] }),
    [anims.skyRotAnim]
  );

  return (
    <PanGestureHandler
      onGestureEvent={handlePanGestureEvent}
      onHandlerStateChange={handlePanHandlerStateChange}
      simultaneousHandlers={[tapRef]}
    >
      <TapGestureHandler
        ref={tapRef}
        onHandlerStateChange={onTapStateChange}
      >
        <View
          style={styles.container}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <Svg width={width} height={height}>
            <Defs>
              <RadialGradient id="glowWhite" cx="50%" cy="50%" r="50%">
                <Stop offset="0%"   stopColor="#ffffff" stopOpacity="0.6" />
                <Stop offset="100%" stopColor="#ffffff" stopOpacity="0"   />
              </RadialGradient>
              <RadialGradient id="glowCyan" cx="50%" cy="50%" r="50%">
                <Stop offset="0%"   stopColor="#A8E6FF" stopOpacity="0.5" />
                <Stop offset="100%" stopColor="#A8E6FF" stopOpacity="0"   />
              </RadialGradient>
              <RadialGradient id="glowGold" cx="50%" cy="50%" r="50%">
                <Stop offset="0%"   stopColor="#E8B14A" stopOpacity="0.5" />
                <Stop offset="100%" stopColor="#E8B14A" stopOpacity="0"   />
              </RadialGradient>
              <RadialGradient id="glowNS" cx="50%" cy="50%" r="50%">
                <Stop offset="0%"   stopColor="#E8B14A" stopOpacity="0.35" />
                <Stop offset="100%" stopColor="#E8B14A" stopOpacity="0"    />
              </RadialGradient>
            </Defs>

            {/* Background ambient stars — static, pre-computed */}
            {BG_STARS.map((s, i) => (
              <Circle
                key={`bg-${i}`}
                cx={s.x * width}
                cy={s.y * height}
                r={s.r}
                fill={`rgba(255,255,255,${s.a})`}
              />
            ))}

            {/* Pannable content — translateX/translateY are RNSVG transform props */}
            <AnimatedG
              translateX={pan.panX as any}
              translateY={pan.panY as any}
            >
              {/* SkyLayer always mounted — AnimatedG must never unmount or web drops the animation */}
              <SkyLayer
                state={state} width={width} height={height}
                glowOpacity={glowOpacity} anims={anims}
                skyRotation={skyRotation} skyCounter={skyCounter}
              />

              {/* ConstLayer stays mounted while any constellation is selected.
                  translateX moves it off-screen at zoom 1 instead of opacity 0 —
                  opacity changes kill AnimatedG rotation listeners on web (same
                  reason SkyLayer's AnimatedG is never unmounted). */}
              {state.selectedConst !== null && (
                <G translateX={state.zoom === 2 ? 0 : -10000}>
                  <ConstLayer
                    state={state} width={width} height={height}
                    glowOpacity={glowOpacity} anims={anims}
                  />
                </G>
              )}
            </AnimatedG>
          </Svg>
        </View>
      </TapGestureHandler>
    </PanGestureHandler>
  );
}

// ─── Sky Layer (Zoom 1) ───────────────────────────────────────────────────────
// The entire constellation field rotates slowly around the North Star.
// Each constellation's label counter-rotates to stay upright.

function SkyLayer({ state, width, height, glowOpacity, anims, skyRotation, skyCounter }: any) {
  const x0         = width  / 2;
  const y0         = height / 2 + 40;
  // Rotation values created in the stable parent — survive SkyLayer remounts
  const rotAnim        = skyRotation;
  const counterRotAnim = skyCounter;

  const atSky = state.zoom === 1;

  return (
    <G>
      {state.hasNorthStar && atSky && (
        <NorthStarGlyph cx={x0} cy={y0} glowOpacity={glowOpacity} />
      )}

      {/* AnimatedG is always in the tree — removing it on zoom change kills the animation on web */}
      <AnimatedG rotation={rotAnim as any} originX={x0} originY={y0}>
        {atSky && state.constellations.map((c: any, i: number) => {
          const pos   = getConstPosition(i);
          const rad   = (pos.angle * Math.PI) / 180;
          const fx    = x0 + Math.cos(rad) * pos.r;
          const fy    = y0 + Math.sin(rad) * pos.r;
          const stars = state.getConstStars(i) as StarNode[];
          const offs  = STAR_OFFSETS[i % 4];
          const isHov = state.hoveredConst === i;

          return (
            <G key={`const-${i}`} opacity={isHov ? 1 : 0.78}>
              {stars.slice(0, -1).map((s: StarNode, j: number) => {
                const a   = offs[j]   ?? { x: 0, y: 0 };
                const b   = offs[j+1] ?? { x: 0, y: 0 };
                const lit = s.status === 'approved' && stars[j+1]?.status === 'approved';
                return (
                  <Line key={`l-${j}`}
                    x1={fx + a.x} y1={fy + a.y}
                    x2={fx + b.x} y2={fy + b.y}
                    stroke={lit ? 'rgba(168,230,255,0.55)' : 'rgba(255,255,255,0.07)'}
                    strokeWidth={lit ? 1 : 0.5}
                  />
                );
              })}

              {stars.map((s: StarNode, j: number) => {
                const off = offs[j] ?? { x: 0, y: 0 };
                return (
                  <StarDot key={s.id}
                    cx={fx + off.x} cy={fy + off.y}
                    status={s.status} r={isHov ? 4.5 : 3.5}
                    glowOpacity={glowOpacity}
                    hasPlanets={s.planets.length > 0}
                    expanded={false} hovered={false}
                  />
                );
              })}

              {isHov && (
                <Circle cx={fx} cy={fy} r={65}
                  stroke="rgba(168,230,255,0.2)" strokeWidth={1}
                  fill="none" strokeDasharray="3 5"
                />
              )}

              {/* Label counter-rotates around the constellation's own centre */}
              <AnimatedG rotation={counterRotAnim as any} originX={fx} originY={fy}>
                <SvgText
                  x={fx} y={fy + 92}
                  fontSize={16}
                  fill={isHov ? 'rgba(168,230,255,0.85)' : 'rgba(255,255,255,0.38)'}
                  textAnchor="middle"
                  fontFamily="Courier New"
                >
                  {c.name}
                </SvgText>
              </AnimatedG>
            </G>
          );
        })}
      </AnimatedG>
    </G>
  );
}

// ─── Constellation Layer (Zoom 2) ─────────────────────────────────────────────

function ConstLayer({ state, width, height, glowOpacity, anims }: any) {
  const ci    = state.selectedConst;
  const x0    = width  / 2;
  const y0    = height / 2 + 40;

  // Constellation center in SVG space — pan in enterConstellation cancels this offset
  // so (cx, cy) ends up at screen centre after the pan animates in.
  const cpos  = getConstPosition(ci);
  const crad  = (cpos.angle * Math.PI) / 180;
  const cx    = x0 + Math.cos(crad) * cpos.r;
  const cy    = y0 + Math.sin(crad) * cpos.r;

  const stars = (state.getConstStars(ci) as StarNode[]);
  const offs  = STAR_OFFSETS[ci % 4];

  return (
    <G>
      {state.constellations.map((_: any, i: number) => {
        if (i === ci) return null;
        const pos = getConstPosition(i);
        const rad = (pos.angle * Math.PI) / 180;
        return (
          <Circle key={`rem-${i}`}
            cx={x0 + Math.cos(rad) * pos.r * 2}
            cy={y0 + Math.sin(rad) * pos.r * 2}
            r={2} fill="rgba(255,255,255,0.07)"
          />
        );
      })}

      {stars.slice(0, -1).map((s: StarNode, j: number) => {
        const a   = offs[j]   ?? { x: 0, y: 0 };
        const b   = offs[j+1] ?? { x: 0, y: 0 };
        const lit = s.status === 'approved' && stars[j+1].status === 'approved';
        return (
          <Line key={`l-${j}`}
            x1={cx + a.x * SC} y1={cy + a.y * SC}
            x2={cx + b.x * SC} y2={cy + b.y * SC}
            stroke={lit ? 'rgba(168,230,255,0.5)' : 'rgba(255,255,255,0.06)'}
            strokeWidth={lit ? 1.2 : 0.5}
          />
        );
      })}

      {stars.map((s: StarNode, j: number) => {
        const off  = offs[j] ?? { x: 0, y: 0 };
        const sx   = cx + off.x * SC;
        const sy   = cy + off.y * SC;
        const exp  = state.expandedStar === s.id;
        const isHov = state.hoveredStar === s.id;
        const r    = exp ? 10 : isHov ? 8 : 6;

        return (
          <G key={s.id}>
            <StarDot
              cx={sx} cy={sy}
              status={s.status} r={r}
              glowOpacity={glowOpacity}
              hasPlanets={s.planets.length > 0}
              expanded={exp} hovered={isHov}
            />
            {s.planets.length > 0 && (
              <PlanetOrbitLayer
                star={s} cx={sx} cy={sy}
                orbitAnim={anims.orbitAnim}
              />
            )}
            <SvgText
              x={sx} y={sy + r + 20}
              fontSize={14}
              fill={isHov ? 'rgba(168,230,255,0.9)' : 'rgba(255,255,255,0.38)'}
              textAnchor="middle"
              fontFamily="Courier New"
            >
              {s.title.split(' ').slice(0, 2).join(' ')}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}

// ─── Star Dot ─────────────────────────────────────────────────────────────────

function StarDot({ cx, cy, status, r, glowOpacity, hasPlanets, expanded, hovered }: {
  cx: number; cy: number; status: string; r: number;
  glowOpacity: any; hasPlanets: boolean; expanded: boolean; hovered: boolean;
}) {
  const glowId = status === 'approved'  ? 'glowWhite' :
                 status === 'active'    ? 'glowCyan'  :
                 status === 'submitted' ? 'glowGold'  : null;

  const stroke = status === 'approved'  ? '#ffffff' :
                 status === 'submitted' ? '#E8B14A' :
                 status === 'active'    ? '#A8E6FF' :
                 hovered                ? 'rgba(255,255,255,0.6)' :
                                          'rgba(255,255,255,0.18)';

  const fill   = status === 'approved' ? '#ffffff' :
                 status === 'active'   ? 'rgba(168,230,255,0.18)' : 'none';

  return (
    <G>
      {glowId && (
        <AnimatedCircle
          cx={cx} cy={cy} r={r + 10}
          fill={`url(#${glowId})`}
          opacity={glowOpacity}
        />
      )}
      <Circle
        cx={cx} cy={cy} r={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={hovered ? 1.5 : 1}
      />
      {status === 'active' && (
        <Circle cx={cx} cy={cy} r={r * 0.45} fill="rgba(168,230,255,0.18)" />
      )}
      {hasPlanets && !expanded && (
        <Circle cx={cx} cy={cy} r={r + 8}
          fill="none" stroke="rgba(168,230,255,0.12)" strokeWidth={0.5}
        />
      )}
    </G>
  );
}

// ─── Planet Orbit Layer ───────────────────────────────────────────────────────

function PlanetOrbitLayer({ star, cx, cy, orbitAnim }: {
  star: StarNode; cx: number; cy: number; orbitAnim: Animated.Value;
}) {
  const orders = [...new Set(star.planets.map(p => p.order))].sort((a, b) => a - b);

  return (
    <G>
      {orders.map((ord, ri) => {
        const orbitR      = 28 + ri * 20;
        const planetsHere = star.planets.filter(p => p.order === ord);

        return (
          <G key={`orbit-${ri}`}>
            <Circle
              cx={cx} cy={cy} r={orbitR}
              fill="none" stroke="rgba(168,230,255,0.1)"
              strokeWidth={0.7} strokeDasharray="4 5"
            />
            {planetsHere.map((pl, pi) => (
              <OrbitingPlanet
                key={pl.id}
                planet={pl}
                cx={cx} cy={cy}
                orbitR={orbitR}
                totalInRing={planetsHere.length}
                ringIdx={ri}
                planetIdx={pi}
                orbitAnim={orbitAnim}
              />
            ))}
          </G>
        );
      })}
    </G>
  );
}

// ─── Individual Orbiting Planet ───────────────────────────────────────────────

function OrbitingPlanet({ planet, cx, cy, orbitR, totalInRing, ringIdx, planetIdx, orbitAnim }: {
  planet: Planet;
  cx: number; cy: number;
  orbitR: number;
  totalInRing: number;
  ringIdx: number;
  planetIdx: number;
  orbitAnim: Animated.Value;
}) {
  // Starting angle in degrees: evenly spaced, 12-o'clock (-90°) is zero offset
  const baseAngleDeg    = (planetIdx / totalInRing) * 360 - 90;
  const speedMultiplier = 1 / (1 + ringIdx * 0.35 + planetIdx * 0.15);

  // Independent rotation per planet — not chained off shared orbitAnim.
  // Chained interpolations lose their web listeners when any ancestor G prop changes
  // (translateX, opacity, etc.); a private loop is immune to all parent re-renders.
  const rotAnim = useRef(new Animated.Value(baseAngleDeg)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotAnim, {
        toValue:         baseAngleDeg + 360,
        duration:        Math.round(8000 / speedMultiplier),
        easing:          Easing.linear,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const px = cx + Math.cos(-Math.PI / 2) * orbitR;
  const py = cy + Math.sin(-Math.PI / 2) * orbitR;

  // AnimatedG must stay in the tree at all times — mounting it fresh when planet.done
  // flips false→true→false loses the web rotation listener, same as the opacity/ConstLayer
  // problem. Use translateX to hide the orbiting dot while keeping AnimatedG alive.
  return (
    <G>
      {/* Locked at 12-o'clock when done */}
      {planet.done && (
        <G>
          <Circle cx={px} cy={py} r={8} fill="rgba(168,230,255,0.12)" />
          <Circle cx={px} cy={py} r={4} fill="#A8E6FF" />
          <Circle cx={px} cy={py} r={6}
            fill="none" stroke="rgba(168,230,255,0.4)" strokeWidth={0.8}
          />
        </G>
      )}

      {/* Orbiting dot — AnimatedG always in tree, slid off-screen while done */}
      <G translateX={planet.done ? -10000 : 0}>
        <AnimatedG rotation={rotAnim as any} originX={cx} originY={cy}>
          <Circle
            cx={cx + orbitR} cy={cy}
            r={3.5}
            fill="rgba(168,230,255,0.06)"
            stroke="rgba(168,230,255,0.45)"
            strokeWidth={1.2}
          />
        </AnimatedG>
      </G>
    </G>
  );
}

// ─── North Star Glyph — compass/astrolabe symbol ─────────────────────────────
// SVG content is the provided Northstar.svg scaled to fit a ~26px radius.

const NS_PATH = "M77.9684 96.3219L60.4045 99.5L77.1903 102.537C59.801 138.985 52.1947 170.25 60.1609 175.302C66.8448 179.541 82.5948 164.124 99.3281 138.516L100 142.997L101.078 135.806C101.488 135.164 101.899 134.516 102.309 133.862C109.309 139.701 116.044 141.857 120.707 138.899C127.781 134.413 127.962 119.508 122.032 102.678L139.596 99.5L122.81 96.4627C140.199 60.0154 147.805 28.7505 139.839 23.698C133.155 19.4589 117.405 34.8756 100.672 60.4841L100 56.0033L98.9218 63.194C98.5118 63.8363 98.1015 64.4844 97.6908 65.1383C90.6908 59.2988 83.9559 57.1432 79.2929 60.1006C72.2193 64.587 72.0376 79.4923 77.9684 96.3219ZM82.2002 159.261C87.4568 153.106 93.171 145.321 98.9965 136.304L98.0309 129.864C93.0367 124.698 88.0937 117.821 83.8486 109.744C82.6962 107.551 81.6391 105.353 80.6791 103.169L78.6871 102.808C70.9559 118.955 65.1575 134.071 61.7869 146.315C59.6604 154.039 58.5246 160.534 58.4444 165.386C58.4043 167.813 58.6303 169.746 59.0779 171.187C59.5215 172.615 60.1507 173.469 60.8808 173.932C61.6109 174.395 62.5988 174.567 63.9466 174.275C65.3066 173.98 66.9431 173.229 68.836 171.977C72.6211 169.475 77.1738 165.147 82.2002 159.261ZM82.4231 103.484C83.2454 105.302 84.1364 107.128 85.0956 108.953C88.8884 116.17 93.2316 122.385 97.6371 127.238L94.4003 105.651L82.4231 103.484ZM101.991 131.576C101.909 131.503 101.827 131.429 101.745 131.356L105.6 105.651L117.739 103.455C116.817 105.279 115.872 107.113 114.904 108.953C110.664 117.02 106.313 124.615 101.991 131.576ZM103.125 132.556C103.438 132.818 103.751 133.073 104.063 133.319C110.652 138.532 116.323 139.854 119.987 137.53C123.651 135.206 125.445 129.15 124.63 120.275C124.154 115.082 122.794 109.155 120.58 102.941L119.549 103.127C118.449 105.321 117.316 107.527 116.151 109.744C111.878 117.875 107.489 125.534 103.125 132.556ZM119.321 95.8315L121.313 96.1919C129.044 80.0453 134.843 64.9289 138.213 52.6855C140.34 44.961 141.475 38.4657 141.556 33.6136C141.596 31.1869 141.37 29.2545 140.922 27.8133C140.479 26.385 139.849 25.5309 139.119 25.0678C138.389 24.6048 137.401 24.4333 136.053 24.7254C134.693 25.0201 133.057 25.7714 131.164 27.0228C127.379 29.5252 122.826 33.8534 117.8 39.7387C112.543 45.8936 106.829 53.6794 101.004 62.6962L101.969 69.1355C106.963 74.3017 111.906 81.1792 116.151 89.2563C117.304 91.4491 118.361 93.6466 119.321 95.8315ZM102.363 71.7618C106.768 76.6152 111.112 82.8304 114.904 90.0471C115.864 91.872 116.755 93.6984 117.577 95.5159L105.6 93.3487L102.363 71.7618ZM98.0092 67.4242C98.091 67.4971 98.1727 67.5705 98.2545 67.6444L94.4003 93.3487L82.2615 95.5451C83.1834 93.721 84.1283 91.8874 85.0956 90.0471C89.3356 81.9795 93.6867 74.3849 98.0092 67.4242ZM96.8751 66.4439C92.5111 73.4661 88.1221 81.1252 83.8486 89.2563C82.6838 91.4726 81.5509 93.6795 80.4512 95.8727L79.4204 96.0592C77.2058 89.8455 75.8463 83.918 75.3697 78.7252C74.5553 69.8502 76.3486 63.7944 80.0129 61.4704C83.6771 59.1464 89.3479 60.4682 95.9373 65.6806C96.249 65.9272 96.5617 66.1817 96.8751 66.4439Z";

function NorthStarGlyph({ cx, cy, glowOpacity }: { cx: number; cy: number; glowOpacity: any }) {
  const SIZE  = 52; // diameter in canvas pixels
  const scale = SIZE / 200;
  const tx    = cx - 99.5  * scale;
  const ty    = cy - 100.165 * scale;

  return (
    <G>
      {/* Animated gold glow halo */}
      <AnimatedCircle cx={cx} cy={cy} r={SIZE * 0.72}
        fill="url(#glowNS)" opacity={glowOpacity}
      />
      <G transform={`translate(${tx}, ${ty}) scale(${scale})`}>
        <Circle cx={99.5} cy={100.165} r={58.5} fill="#C9A84C" />
        <Path fillRule="evenodd" clipRule="evenodd" d={NS_PATH} fill="white" />
      </G>
    </G>
  );
}

// ─── Background Stars (pre-computed, static) ──────────────────────────────────

const BG_STARS = Array.from({ length: 80 }, (_, i) => ({
  x: (Math.sin(i * 137.5) * 0.5 + 0.5) * 1.4 - 0.2,
  y: (Math.cos(i * 97.3)  * 0.5 + 0.5) * 1.4 - 0.2,
  r: i % 7 === 0 ? 1.1 : 0.55,
  a: ((Math.sin(i * 0.8) * 0.25 + 0.15) * 0.5).toFixed(2),
}));

// ─── Utility ──────────────────────────────────────────────────────────────────

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
});
