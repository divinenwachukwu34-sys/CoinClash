const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T = any>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Bypass-Tunnel-Reminder': 'true',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let data: any;
  try { data = await res.json(); } catch { throw new ApiError(`Server error (${res.status})`); }
  if (!res.ok) throw new ApiError(data?.detail ?? data?.error ?? data?.message ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export const api = {
  // Auth
  signup: (email: string, username: string, password: string, phone?: string, referral_code?: string) =>
    request<{ token: string; user: User; referralMessage?: string }>('/auth/signup', {
      method: 'POST', body: JSON.stringify({ email, username, password, phone, referral_code }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: (token: string) => request<User>('/auth/me', {}, token),

  // Payment
  initPayment: (amount_ngn: number, token: string) =>
    request<{ authorization_url: string; reference: string; coins: number }>(
      '/payment/initialize', { method: 'POST', body: JSON.stringify({ amount_ngn }) }, token),
  verifyPayment: (reference: string, token: string) =>
    request<{ coins: number; newBalance: number; referralBonus?: number }>(
      '/payment/verify', { method: 'POST', body: JSON.stringify({ reference }) }, token),
  getDepositTiers: () =>
    request<{ amount_ngn: number; coins: number; bonus: number; total: number }[]>('/payment/tiers'),
  giftCoins: (recipient_username: string, amount_coins: number, token: string) =>
    request<{ success: boolean; message: string; newBalance: number }>(
      '/gift', { method: 'POST', body: JSON.stringify({ recipient_username, amount_coins }) }, token),
  createReservedAccount: (token: string, phone?: string) =>
    request<{ bankName: string; accountNumber: string; accountName: string }>(
      '/payment/reserved-account', { method: 'POST', body: JSON.stringify({ phone }) }, token),

  // Banks
  getBanks: (token: string) => request<{ name: string; code: string }[]>('/banks/list', {}, token),
  resolveAccount: (account_number: string, bank_code: string, token: string) =>
    request<{ account_name: string; account_number: string }>(
      '/banks/resolve', { method: 'POST', body: JSON.stringify({ account_number, bank_code }) }, token),
  addBankAccount: (data: { bank_code: string; bank_name: string; account_number: string; account_name: string }, token: string) =>
    request<BankAccount>('/banks/add', { method: 'POST', body: JSON.stringify(data) }, token),
  getMyBanks: (token: string) => request<BankAccount[]>('/banks/mine', {}, token),
  deleteBankAccount: (id: number, token: string) => request('/banks/' + id, { method: 'DELETE' }, token),

  // Withdrawal
  requestWithdrawal: (amount_coins: number, bank_account_id: number, token: string) =>
    request<WithdrawResult>('/withdrawal/request', {
      method: 'POST', body: JSON.stringify({ amount_coins, bank_account_id }),
    }, token),
  finalizeWithdrawal: (withdrawal_id: number, otp: string, token: string) =>
    request<{ success: boolean; message: string }>(
      '/withdrawal/finalize', { method: 'POST', body: JSON.stringify({ withdrawal_id, otp }) }, token),
  getPendingWithdrawals: (token: string) => request<PendingWithdrawal[]>('/withdrawal/pending', {}, token),
  retryQueuedWithdrawals: (token: string) =>
    request<{ processed: number; results: any[] }>('/withdrawal/retry-queued', { method: 'POST' }, token),

  // Daily Bonus
  getBonusStatus: (token: string) =>
    request<BonusStatus>('/bonus/status', {}, token),
  claimBonus: (token: string) =>
    request<{ claimed: boolean; coinsAwarded: number; newBalance: number; newStreak: number; message: string; streakBroken: boolean }>(
      '/bonus/claim', { method: 'POST' }, token),

  // Referral
  getMyReferralCode: (token: string) =>
    request<{ code: string; shareMessage: string; stats: { totalReferrals: number; converted: number; coinsEarned: number } }>(
      '/referral/my-code', {}, token),
  applyReferralCode: (code: string, token: string) =>
    request<{ success: boolean; referrerUsername: string; message: string }>(
      '/referral/apply', { method: 'POST', body: JSON.stringify({ code }) }, token),
  getReferralStatus: (token: string) =>
    request<{ hasReferral: boolean; bonusPaid: boolean; referrerUsername: string | null }>(
      '/referral/status', {}, token),

  // Leaderboard
  getLeaderboard: (type: 'weekly' | 'alltime', token: string) =>
    request<LeaderboardData>(`/leaderboard?type=${type}`, {}, token),

  // Admin
  getAdminStats: (token: string) => request<AdminStats>('/admin/stats', {}, token),

  // Game
  saveGame: (data: { stake: number; won: boolean; playerScore: number; opponentScore: number; prize: number; gameType: string }, token: string) =>
    request<{ newBalance: number }>('/game/save', { method: 'POST', body: JSON.stringify(data) }, token),
  getHistory: (token: string) => request<GameResult[]>('/game/history', {}, token),

  // Profile
  getProfile: (token: string) => request<ProfileData>('/profile', {}, token),
  updateProfile: (username: string, token: string) =>
    request('/profile', { method: 'PATCH', body: JSON.stringify({ username }) }, token),
  // Tournament
  getTournaments: (token: string) => request<Tournament[]>('/tournaments', {}, token),
  joinTournament: (id: number, token: string) => 
    request<{ success: boolean; newBalance: number }>(`/tournaments/${id}/join`, { method: 'POST' }, token),
  getTournamentDetails: (id: number, token: string) =>
    request<TournamentDetails>(`/tournaments/${id}`, {}, token),
  submitTournamentMatch: (id: number, won: boolean, gameType: string, playerScore: number, opponentScore: number, token: string) =>
    request<TournamentSubmitResult>(`/tournaments/${id}/submit`, {
      method: 'POST', body: JSON.stringify({ won, gameType, playerScore, opponentScore })
    }, token),
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  username: string;
  coinBalance: number;
  reservedBankName?: string;
  reservedAccountNumber?: string;
  reservedAccountName?: string;
}

export interface BankAccount {
  id: number;
  user_id: number;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  recipient_code: string;
  is_default: boolean;
  created_at: string;
}

export interface WithdrawResult {
  success?: boolean;
  newBalance?: number;
  amountNgn?: number;
  reference?: string;
  message?: string;
  requiresOtp?: boolean;
  withdrawalId?: number;
  transferCode?: string;
  queued?: boolean;
  paystackError?: string;
}

export interface PendingWithdrawal {
  id: number;
  user_id: number;
  bank_account_id: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  amount_ngn: number;
  amount_coins: number;
  reference: string;
  status: 'queued' | 'otp' | 'success' | 'failed';
  paystack_transfer_code: string | null;
  error_message: string | null;
  created_at: string;
}

export interface BonusStatus {
  canClaim: boolean;
  streak: number;
  nextStreak: number;
  coinsToday: number;
  hoursUntilNext: number;
  lastClaimAt: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  wins: number;
  losses: number;
  totalGames: number;
  netCoins: number;
  loginStreak: number;
  isMe: boolean;
}

export interface LeaderboardData {
  type: string;
  board: LeaderboardEntry[];
  myRank: number | null;
  poolAmount?: number;
}

export interface AdminStats {
  users: { total: number; todaySignups: number };
  games: { total: number; thisWeek: number };
  revenue: { totalCoins: number; totalNgn: string; last30DaysCoins: number; last30DaysNgn: string };
  pendingWithdrawals: any[];
  topPlayers: any[];
}

export interface GameResult {
  id: number;
  user_id: number;
  game_type: string;
  stake: number;
  won: boolean;
  player_score: number;
  opponent_score: number;
  prize: number;
  created_at: string;
}

export interface ProfileData {
  id: number;
  email: string;
  username: string;
  coinBalance: number;
  reservedBankName?: string;
  reservedAccountNumber?: string;
  reservedAccountName?: string;
  stats: { wins: number; losses: number; total: number; winRate: number; bestTime: number | null };
  recentTransactions: any[];
}

export interface Tournament {
  id: number;
  title: string;
  type: string;
  entryFee: number;
  prizePool: number;
  startTime: string;
  endTime: string;
  status: string;
  participants: number;
}

export interface TournamentPlayer {
  rank: number;
  userId: number;
  username: string;
  score: number;
  lives: number;
  status: string;
  isMe?: boolean;
}

export interface TournamentDetails extends Tournament {
  board: TournamentPlayer[];
  myStatus: TournamentPlayer | null;
}

export interface TournamentSubmitResult {
  success: boolean;
  score: number;
  lives: number;
  status: string;
  eliminated: boolean;
}
