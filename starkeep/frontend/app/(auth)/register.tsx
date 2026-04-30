/**
 * app/(auth)/register.tsx
 *
 * Account creation screen.
 * Alias (heroic name) is set after the archetype quiz per DEC-012 — not here.
 */

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Link } from 'expo-router';
import { colors, typography, spacing, radii } from '../../design-system/tokens';
import { authApi } from '../../features/auth/index';
import { useAuthStore } from '../../features/auth/store';
import { ApiError } from '../../lib/api-client';

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [errors,      setErrors]      = useState<{
    display_name?: string;
    email?: string;
    password?: string;
    general?: string;
  }>({});

  const login = useAuthStore(s => s.login);

  async function handleCreateAccount() {
    setErrors({});
    const next: typeof errors = {};

    if (!displayName.trim()) next.display_name = 'Your name is required.';
    if (!email.trim())       next.email        = 'Email is required.';
    if (password.length < 8) next.password     = 'Password must be at least 8 characters.';
    if (Object.keys(next).length) { setErrors(next); return; }

    setLoading(true);
    try {
      const result = await authApi.register({
        email:        email.trim(),
        password,
        display_name: displayName.trim(),
      });
      await login(result.access, result.refresh);
      // (auth)/_layout.tsx handles redirect once isAuthenticated flips
    } catch (err) {
      if (err instanceof ApiError && err.invalidParams?.length) {
        const mapped: typeof errors = {};
        for (const p of err.invalidParams) {
          if (p.field === 'email')        mapped.email        = p.message;
          if (p.field === 'password')     mapped.password     = p.message;
          if (p.field === 'display_name') mapped.display_name = p.message;
        }
        setErrors(Object.keys(mapped).length ? mapped : { general: err.detail });
      } else {
        setErrors({ general: err instanceof ApiError ? err.detail : 'Something went wrong. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSocialAuth() {
    Alert.alert('Coming Soon', 'Social sign-in launches in the next update.');
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Dome header */}
        <View style={styles.dome}>
          <Text style={styles.logoLine1}>STAR◆KEEP</Text>
          <Text style={styles.logoLine2}>ACADEMY</Text>
        </View>

        {/* Form */}
        <View style={styles.body}>
          <Text style={styles.title}>JOIN THE ACADEMY</Text>

          {errors.general ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errors.general}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <TextInput
              style={[styles.input, errors.display_name && styles.inputError]}
              placeholder="Your Name"
              placeholderTextColor={colors.fg.subtle}
              autoCapitalize="words"
              value={displayName}
              onChangeText={setDisplayName}
              editable={!loading}
            />
            {errors.display_name ? <Text style={styles.fieldError}>{errors.display_name}</Text> : null}
          </View>

          <View style={styles.field}>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              placeholder="Email"
              placeholderTextColor={colors.fg.subtle}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />
            {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
          </View>

          <View style={styles.field}>
            <TextInput
              style={[styles.input, errors.password && styles.inputError]}
              placeholder="Password (min 8 characters)"
              placeholderTextColor={colors.fg.subtle}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!loading}
              onSubmitEditing={handleCreateAccount}
            />
            {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
          </View>

          <Pressable
            style={({ pressed }) => [styles.primaryButton, (loading || pressed) && styles.primaryButtonPressed]}
            onPress={handleCreateAccount}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            {loading
              ? <ActivityIndicator color={colors.fg.primary} />
              : <Text style={styles.primaryButtonText}>CREATE ACCOUNT</Text>
            }
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={({ pressed }) => [styles.socialButton, pressed && styles.socialButtonPressed]}
            onPress={handleSocialAuth}
            accessibilityRole="button"
          >
            <Text style={styles.socialButtonText}>CONTINUE WITH GOOGLE</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.socialButton, pressed && styles.socialButtonPressed]}
            onPress={handleSocialAuth}
            accessibilityRole="button"
          >
            <Text style={styles.socialButtonText}>CONTINUE WITH APPLE</Text>
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already a hero? </Text>
            <Link href="/(auth)/login" asChild>
              <Pressable accessibilityRole="link">
                <Text style={styles.footerLink}>Sign In</Text>
              </Pressable>
            </Link>
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  scroll: {
    flexGrow: 1,
  },
  dome: {
    height: 200,
    backgroundColor: colors.bg.dome,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  logoLine1: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.wider,
  },
  logoLine2: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.regular,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.widest,
    marginTop: spacing.xs,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  title: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.wider,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  errorBanner: {
    backgroundColor: `${colors.semantic.danger}22`,
    borderWidth: 1,
    borderColor: colors.semantic.danger,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    color: colors.semantic.danger,
    fontSize: typography.sizes.sm,
    textAlign: 'center',
  },
  field: {
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.bg.input,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    color: colors.fg.primary,
    fontSize: typography.sizes.base,
    fontFamily: typography.fonts.body,
  },
  inputError: {
    borderColor: colors.semantic.danger,
  },
  fieldError: {
    color: colors.semantic.danger,
    fontSize: typography.sizes.xs,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
  primaryButton: {
    backgroundColor: colors.accent.blue,
    borderRadius: radii.full,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryButtonPressed: {
    opacity: 0.8,
  },
  primaryButtonText: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.wider,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border.default,
  },
  dividerLabel: {
    color: colors.fg.muted,
    fontSize: typography.sizes.xs,
    marginHorizontal: spacing.md,
    letterSpacing: typography.tracking.wider,
  },
  socialButton: {
    borderWidth: 1.5,
    borderColor: colors.border.strong,
    borderRadius: radii.full,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  socialButtonPressed: {
    borderColor: colors.fg.primary,
    opacity: 0.8,
  },
  socialButtonText: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    color: colors.fg.muted,
    letterSpacing: typography.tracking.wide,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    color: colors.fg.muted,
    fontSize: typography.sizes.sm,
  },
  footerLink: {
    color: colors.accent.cyan,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fonts.display,
    letterSpacing: typography.tracking.wide,
  },
});
