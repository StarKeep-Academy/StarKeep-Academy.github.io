/**
 * app/(shell)/star-maps/index.tsx
 *
 * Phase 3 — Star Map read view.
 * Shows the full hierarchy: ConstellationPaths → Constellations → Stars
 * plus a Pending Milestones section below.
 *
 * Phase 4 will add create/edit/submit actions.
 */

import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../../features/auth/store';
import {
  useStarMap,
  type StarMap,
  type ConstellationPath,
  type Constellation,
  type Star,
  type PendingMilestone,
} from '../../../features/starmap/index';
import {
  colors,
  typography,
  spacing,
  radii,
  layout,
  statusColors,
} from '../../../design-system/tokens';

// ─── Dev mock (used when backend is not running in __DEV__ mode) ──────────────

const DEV_STAR_MAP: StarMap = {
  avatar_id: '00000000-0000-0000-0000-000000000002',
  total_stars: 3,
  total_constellations: 1,
  constellation_paths: [
    {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Digital Futures Arc',
      constellations: [
        {
          id: '00000000-0000-0000-0000-000000000020',
          name: 'Creative Technology',
          symbol: 'wolf',
          completed_at: '2026-03-01T00:00:00Z',
          stars: [
            {
              id: '00000000-0000-0000-0000-000000000030',
              title: 'Completed 3D Printing 101',
              completed_at: '2026-02-01T00:00:00Z',
              lux_issued: 14,
              x: 0.42,
              y: 0.67,
            },
            {
              id: '00000000-0000-0000-0000-000000000031',
              title: 'Built a sustainable lamp prototype',
              completed_at: '2026-02-15T00:00:00Z',
              lux_issued: 16,
              x: 0.58,
              y: 0.43,
            },
            {
              id: '00000000-0000-0000-0000-000000000032',
              title: 'Distributed lamps to 5 households',
              completed_at: '2026-03-01T00:00:00Z',
              lux_issued: 22,
              x: 0.5,
              y: 0.8,
            },
          ],
        },
      ],
    },
  ],
  pending_milestones: [
    {
      id: '00000000-0000-0000-0000-000000000040',
      title: 'Plant a community garden',
      status: 'active',
      validation_status: 'not_submitted',
      constellation_id: null,
    },
    {
      id: '00000000-0000-0000-0000-000000000041',
      title: 'Document solar panel installation',
      status: 'submitted',
      validation_status: 'pending_review',
      constellation_id: '00000000-0000-0000-0000-000000000020',
    },
    {
      id: '00000000-0000-0000-0000-000000000042',
      title: 'Community water filtration proposal',
      status: 'rejected',
      validation_status: 'rejected',
      constellation_id: null,
      rejection_feedback: 'Please add more evidence photos of the installation process.',
    },
  ],
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function StarMapsScreen() {
  const avatarId = useAuthStore((s) => s.avatarId);
  const { data, isLoading, isError, error } = useStarMap(avatarId ?? '');

  // In dev, fall back to mock data when the backend isn't running.
  // The check is intentionally narrow: only "Failed to fetch" (connection refused),
  // not API errors (auth failures, 404s) which should surface normally.
  const isConnectionRefused =
    __DEV__ && isError && (error as Error)?.message === 'Failed to fetch';
  const displayData = isConnectionRefused ? DEV_STAR_MAP : data;
  const showError = isError && !isConnectionRefused;

  return (
    <View style={styles.container}>
      <ScreenHeader
        totalStars={displayData?.total_stars}
        totalConstellations={displayData?.total_constellations}
      />

      {isConnectionRefused && <DevBanner />}

      {isLoading && <LoadingState />}

      {showError && (
        <ErrorState
          message={(error as Error)?.message ?? 'Could not load your Star Map.'}
        />
      )}

      {!isLoading && !showError && displayData && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {displayData.constellation_paths.length > 0 ? (
            displayData.constellation_paths.map((path) => (
              <ConstellationPathSection key={path.id} path={path} />
            ))
          ) : (
            <EmptyConstellations />
          )}

          <PendingSection milestones={displayData.pending_milestones} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function ScreenHeader({
  totalStars,
  totalConstellations,
}: {
  totalStars?: number;
  totalConstellations?: number;
}) {
  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>‹ MENU</Text>
      </Pressable>

      <Text style={styles.title}>STAR MAPS</Text>

      {totalStars !== undefined && (
        <View style={styles.statsRow}>
          <StatBadge value={totalStars} label="STARS" />
          <View style={styles.statDivider} />
          <StatBadge value={totalConstellations ?? 0} label="CONSTELLATIONS" />
        </View>
      )}
    </View>
  );
}

function StatBadge({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statBadge}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Constellation Path Section ───────────────────────────────────────────────

function ConstellationPathSection({ path }: { path: ConstellationPath }) {
  return (
    <View style={styles.pathSection}>
      <Text style={styles.pathName}>{path.name.toUpperCase()}</Text>

      {path.constellations.length > 0 ? (
        path.constellations.map((constellation) => (
          <ConstellationCard key={constellation.id} constellation={constellation} />
        ))
      ) : (
        <Text style={styles.emptyHint}>No constellations yet.</Text>
      )}
    </View>
  );
}

// ─── Constellation Card ───────────────────────────────────────────────────────

function ConstellationCard({ constellation }: { constellation: Constellation }) {
  const isComplete = !!constellation.completed_at;

  return (
    <View style={styles.constellationCard}>
      <View style={styles.constellationHeader}>
        <View style={styles.constellationMeta}>
          <Text style={styles.constellationName}>{constellation.name}</Text>
          {constellation.symbol ? (
            <Text style={styles.constellationSymbol}>
              {constellation.symbol.toUpperCase()}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            styles.completePill,
            { backgroundColor: isComplete ? colors.semantic.success : colors.bg.card },
          ]}
        >
          <Text
            style={[
              styles.completePillText,
              { color: isComplete ? colors.bg.surface : colors.fg.muted },
            ]}
          >
            {isComplete ? 'COMPLETE' : 'IN PROGRESS'}
          </Text>
        </View>
      </View>

      {constellation.stars.length > 0 ? (
        <View style={styles.starList}>
          {constellation.stars.map((star) => (
            <StarRow key={star.id} star={star} />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyHint}>No stars earned yet.</Text>
      )}
    </View>
  );
}

// ─── Star Row ─────────────────────────────────────────────────────────────────

function StarRow({ star }: { star: Star }) {
  const date = star.completed_at
    ? new Date(star.completed_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <View style={styles.starRow}>
      <Text style={styles.starDot}>★</Text>
      <View style={styles.starInfo}>
        <Text style={styles.starTitle}>{star.title}</Text>
        {date && <Text style={styles.starDate}>{date}</Text>}
      </View>
      {star.lux_issued > 0 && (
        <Text style={styles.starLux}>+{star.lux_issued} LUX</Text>
      )}
    </View>
  );
}

// ─── Pending Milestones Section ───────────────────────────────────────────────

function PendingSection({ milestones }: { milestones: PendingMilestone[] }) {
  if (milestones.length === 0) return null;

  return (
    <View style={styles.pendingSection}>
      <Text style={styles.sectionHeading}>ACTIVE MILESTONES</Text>
      {milestones.map((m) => (
        <MilestoneRow key={m.id} milestone={m} />
      ))}
    </View>
  );
}

function MilestoneRow({ milestone }: { milestone: PendingMilestone }) {
  const statusColor = statusColors[milestone.status] ?? colors.fg.muted;

  return (
    <View style={styles.milestoneRow}>
      <View style={styles.milestoneInfo}>
        <Text style={styles.milestoneTitle}>{milestone.title}</Text>
        {milestone.status === 'rejected' && milestone.rejection_feedback ? (
          <Text style={styles.rejectionNote}>{milestone.rejection_feedback}</Text>
        ) : null}
      </View>
      <View style={[styles.statusPill, { borderColor: statusColor }]}>
        <Text style={[styles.statusPillText, { color: statusColor }]}>
          {milestone.status.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

// ─── Empty / Loading / Error / Dev States ─────────────────────────────────────

function DevBanner() {
  return (
    <View style={styles.devBanner}>
      <Text style={styles.devBannerText}>DEV — MOCK DATA (backend not running)</Text>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.accent.cyan} />
      <Text style={styles.loadingText}>LOADING STAR MAP</Text>
    </View>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.errorTitle}>UNABLE TO LOAD</Text>
      <Text style={styles.errorDetail}>{message}</Text>
    </View>
  );
}

function EmptyConstellations() {
  return (
    <View style={styles.emptyConstellations}>
      <Text style={styles.emptyTitle}>YOUR SKY IS EMPTY</Text>
      <Text style={styles.emptyBody}>
        Complete milestones to earn Stars and form Constellations.
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },

  // Header
  header: {
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  backText: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    color: colors.fg.muted,
    letterSpacing: typography.tracking.wider,
  },
  title: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xl,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.widest,
    marginBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  statBadge: {
    alignItems: 'center',
  },
  statValue: {
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.lg,
    color: colors.accent.cyan,
    letterSpacing: typography.tracking.wide,
  },
  statLabel: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    color: colors.fg.muted,
    letterSpacing: typography.tracking.wider,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border.default,
  },

  // Dev banner
  devBanner: {
    backgroundColor: colors.semantic.warning,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  devBannerText: {
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.xs,
    color: colors.fg.inverse,
    letterSpacing: typography.tracking.wide,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: layout.navContentPad,
    gap: spacing.xl,
  },

  // Constellation Path
  pathSection: {
    gap: spacing.md,
  },
  pathName: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    color: colors.accent.gold,
    letterSpacing: typography.tracking.widest,
    marginBottom: spacing.xs,
  },

  // Constellation Card
  constellationCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  constellationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  constellationMeta: {
    flex: 1,
    gap: 2,
  },
  constellationName: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.sm,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.wide,
  },
  constellationSymbol: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.xs,
    color: colors.fg.subtle,
    letterSpacing: typography.tracking.wider,
  },
  completePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  completePillText: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    letterSpacing: typography.tracking.wide,
  },

  // Stars
  starList: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
  },
  starDot: {
    fontSize: typography.sizes.xs,
    color: colors.accent.gold,
    marginTop: 2,
  },
  starInfo: {
    flex: 1,
    gap: 2,
  },
  starTitle: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.base,
    color: colors.fg.primary,
  },
  starDate: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.xs,
    color: colors.fg.muted,
  },
  starLux: {
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.xs,
    color: colors.accent.gold,
    letterSpacing: typography.tracking.wide,
  },

  // Pending Milestones
  pendingSection: {
    gap: spacing.sm,
  },
  sectionHeading: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    color: colors.fg.muted,
    letterSpacing: typography.tracking.widest,
    marginBottom: spacing.xs,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg.card,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  milestoneInfo: {
    flex: 1,
    gap: 4,
  },
  milestoneTitle: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.base,
    color: colors.fg.primary,
  },
  rejectionNote: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.xs,
    color: colors.semantic.danger,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  statusPillText: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    letterSpacing: typography.tracking.wide,
  },

  // Empty / Loading / Error
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  loadingText: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    color: colors.fg.muted,
    letterSpacing: typography.tracking.widest,
    marginTop: spacing.sm,
  },
  errorTitle: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.md,
    color: colors.semantic.danger,
    letterSpacing: typography.tracking.wider,
  },
  errorDetail: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.sm,
    color: colors.fg.muted,
    textAlign: 'center',
  },
  emptyConstellations: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  emptyTitle: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.md,
    color: colors.fg.muted,
    letterSpacing: typography.tracking.widest,
  },
  emptyBody: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.sm,
    color: colors.fg.subtle,
    textAlign: 'center',
    lineHeight: typography.sizes.sm * typography.lineHeights.relaxed,
  },
  emptyHint: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.xs,
    color: colors.fg.subtle,
    paddingLeft: spacing.xs,
  },
});
