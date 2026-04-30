/**
 * features/lux/index.ts
 *
 * LUX economy feature barrel.
 * Read-only in v1: wallet balance + transaction history.
 * Transfer and donate return 501 — handled gracefully.
 *
 * VR NOTE (DEC-006): Wallet and Transaction types are VR-stable.
 * hero_action_type enables VR particle effects per transaction.
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient, NotImplementedError } from '../../lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Wallet {
  avatar_id:             string;
  positive_balance:      number;   // LUX+ (earned, non-cashable in v1)
  negative_balance:      number;   // LUX- (received via transfer — v2+)
  total_earned_lifetime: number;
  level:                 number;
  updated_at:            string;
}

export type TransactionType = 'issuance' | 'level_up' | 'transfer' | 'donation' | 'spend';
export type TransactionCharge = 'POS' | 'NEG' | 'CON';

export interface LvmScores {
  i:   number;    // Impact Longevity
  s:   number;    // Scope of Benefit
  u:   number;    // Urgency of Need
  r:   number;    // Rarity & Innovation
  h:   number;    // Human Effort & Skill
  vsm: number;    // Validation Strength Multiplier
}

// VR-stable — hero_action_type triggers VR spatial effects (DEC-006)
export interface Transaction {
  id:                      string;
  type:                    TransactionType;
  charge:                  TransactionCharge;
  amount:                  number;
  source_milestone_id?:    string;
  source_milestone_title?: string;
  hero_action_type:        string;   // e.g. "community_impact", "ecological_impact"
  lvm_scores:              LvmScores;
  created_at:              string;
  metadata:                Record<string, unknown>;
}

// ─── API Functions ────────────────────────────────────────────────────────────
export const luxApi = {
  getWallet: (avatarId: string) =>
    apiClient.get<Wallet>(`/lux/wallet/${avatarId}`),

  getTransactions: (params?: { page?: number; type?: TransactionType }) => {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.type) search.set('type', params.type);
    return apiClient.get<Transaction[]>(`/lux/transactions?${search}`);
  },

  // v2 stubs — call these to get the 501 modal flow
  transfer: (_payload: { recipient_avatar_id: string; amount: number }) =>
    apiClient.post('/lux/transfer', _payload),

  donate: (_payload: { mission_id: string; amount: number }) =>
    apiClient.post('/lux/donate', _payload),
};

// ─── Query Keys ───────────────────────────────────────────────────────────────
export const luxKeys = {
  wallet:       (avatarId: string) => ['lux', 'wallet', avatarId]   as const,
  transactions: (filters?: object) => ['lux', 'transactions', filters] as const,
};

// ─── React Query Hooks ────────────────────────────────────────────────────────
export function useWallet(avatarId: string) {
  return useQuery({
    queryKey: luxKeys.wallet(avatarId),
    queryFn:  () => luxApi.getWallet(avatarId),
    enabled:  !!avatarId,
    staleTime: 1000 * 30,  // 30 seconds — balance updates frequently
  });
}

export function useTransactions(params?: { type?: TransactionType }) {
  return useQuery({
    queryKey: luxKeys.transactions(params),
    queryFn:  () => luxApi.getTransactions(params),
    staleTime: 1000 * 60,
  });
}

// LUX charge type display helpers
export const chargeLabel: Record<TransactionCharge, string> = {
  POS: 'LUX+',
  NEG: 'LUX−',
  CON: 'Consumed',
};

export const transactionLabel: Record<TransactionType, string> = {
  issuance: 'Milestone Reward',
  level_up: 'Level Up',
  transfer: 'Transfer',
  donation: 'Donation',
  spend:    'Store Purchase',
};
