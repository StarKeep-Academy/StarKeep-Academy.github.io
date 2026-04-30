/**
 * design-system/tokens.ts
 *
 * Single source of truth for all design values.
 * Sourced from wireframe color analysis (Images 1–7) + STARKEEP_CONTEXT.md §10.
 *
 * DO NOT add one-off colors inline in components.
 * If a color isn't here, add it here first, then use it.
 */

// ─── Colors ──────────────────────────────────────────────────────────────────
export const colors = {
  bg: {
    base:    '#3A3A3A',   // Dark slate — primary app background (all wireframes)
    dome:    '#2D6CDF',   // Royal blue — the curved dome region (Images 3–6 top arc)
    surface: '#1F2A44',   // Dark navy — cards, panels (Image 7 left/center panels)
    card:    '#2A2A2A',   // Slightly lighter slate — card surfaces
    input:   '#2F2F2F',   // Input field backgrounds
    overlay: 'rgba(0,0,0,0.7)',
  },
  fg: {
    primary: '#FFFFFF',
    muted:   '#B0B0B0',   // Secondary text, captions, level subtext
    subtle:  '#6B7280',   // Placeholder text, disabled states
    inverse: '#1F2A44',   // Text on light backgrounds
  },
  accent: {
    cyan:  '#A8E6FF',     // Active nav indicator glow, focus states
    gold:  '#E8B14A',     // Logo diamond, premium accents, LUX+ indicator
    blue:  '#2D6CDF',     // Dome color reused as interactive accent, buttons
    glow:  'rgba(168, 230, 255, 0.3)',  // Cyan glow for active glyphs
  },
  semantic: {
    success: '#5CC689',   // Approved milestones, positive states
    warning: '#E8B14A',   // Pending validation, warnings (same as gold)
    danger:  '#E25B5B',   // Rejected, errors, destructive
    pending: '#A8E6FF',   // Submitted/awaiting (same as cyan)
    info:    '#2D6CDF',
  },
  border: {
    default: 'rgba(255,255,255,0.1)',
    strong:  'rgba(255,255,255,0.25)',
    accent:  '#2D6CDF',
  },
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────
// Display font must be loaded via expo-font before use
export const typography = {
  fonts: {
    display: 'Syncopate',          // STARKEEP headings, alias names, section titles
    body:    'System',             // Platform default (SF Pro / Roboto)
    mono:    'SpaceMono',          // LUX values, level numbers, transaction IDs
  },
  sizes: {
    xs:   10,
    sm:   12,
    base: 14,
    md:   16,
    lg:   20,
    xl:   24,
    xxl:  32,
    hero: 48,   // Avatar alias display (e.g. "DREAMWALKER")
  },
  weights: {
    regular: '400' as const,
    medium:  '500' as const,
    bold:    '700' as const,
  },
  tracking: {
    tight:  -0.5,
    normal:  0,
    wide:    1.5,
    wider:   3,
    widest:  5,   // Display headings like "STAR MAPS"
  },
  lineHeights: {
    tight:  1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const spacing = {
  xs:   4,
  sm:   8,
  md:   16,
  lg:   24,
  xl:   32,
  xxl:  48,
  xxxl: 64,
} as const;

// ─── Border Radii ─────────────────────────────────────────────────────────────
export const radii = {
  sm:   4,
  md:   8,
  lg:   16,
  xl:   24,
  full: 9999,
} as const;

// ─── Shadows / Elevation ─────────────────────────────────────────────────────
export const shadows = {
  glyph: {               // Active glyph glow (cyan)
    shadowColor:  colors.accent.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

// ─── Animation Durations ──────────────────────────────────────────────────────
export const durations = {
  fast:   150,
  normal: 250,
  slow:   400,
  crawl:  600,
} as const;

// ─── Layout ───────────────────────────────────────────────────────────────────
export const layout = {
  // Radial nav dome height (the curved blue arc at its center/tallest point)
  navDomeHeight: 220,
  // Bottom padding screens must apply so content clears the nav overlay
  navContentPad: 280,
  // Avatar card min-width (Image 7 left panel)
  avatarCardWidth: 240,
  // Max content width on wide screens
  maxContentWidth: 1200,
} as const;

// ─── Status Colors (for milestone status pills) ────────────────────────────────
export const statusColors: Record<string, string> = {
  pending:   colors.fg.muted,
  active:    colors.accent.blue,
  submitted: colors.semantic.pending,
  approved:  colors.semantic.success,
  rejected:  colors.semantic.danger,
};

// ─── Heroic Path Colors (unique accent per path) ──────────────────────────────
// Used for path badges, guild banners, campus accents
export const pathColors: Record<string, string> = {
  earthwatcher: '#5CC689',   // green — nature
  peacebringer: '#7EC8E3',   // soft blue — water/care
  storyteller:  '#C88FE8',   // violet — creativity
  innovator:    '#E8B14A',   // gold — technology
  dreamwalker:  '#A8E6FF',   // cyan — consciousness
  truthseeker:  '#E87B5A',   // amber — knowledge
};
