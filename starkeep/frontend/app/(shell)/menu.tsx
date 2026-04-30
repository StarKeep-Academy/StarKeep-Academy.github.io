/**
 * app/(shell)/menu.tsx
 *
 * The main navigation hub. Shown immediately after login / splash.
 * Replaced by each content screen when the user selects a destination.
 * The back button / HOME button on content screens returns here.
 *
 * Route: /(shell)/menu
 *
 * Renders the full-screen RadialNav component:
 *   - Blue dome at top (Earth sphere, offset above screen)
 *   - 5 glyph buttons along the arc bottom edge
 *   - Animated compass needle (rotates around dome center)
 *   - Content area below dome (section info + sub-items on press)
 */

import { RadialNav } from '../../design-system/components/RadialNav';

export default function MenuScreen() {
  return <RadialNav />;
}
