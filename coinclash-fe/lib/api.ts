import { API_BASE_URL } from '@/constants/config';

export class ApiError extends Error {
  constructor(message: string, public status?: number, public code?: string) {
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });
    clearTimeout(timeoutId);

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new ApiError(`Server error (${res.status})`, res.status);
    }

    if (!res.ok) {
      const errorMessage =
        data?.detail ??
        data?.error ??
        data?.message ??
        `Request failed (${res.status})`;
      throw new ApiError(errorMessage, res.status, data?.code);
    }

    return data as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err instanceof ApiError) {
      throw err;
    }
    if (err.name === 'AbortError') {
      throw new ApiError('Request timed out. Please check your network connection.', 408);
    }
    if (err.message === 'Network request failed' || err.name === 'TypeError') {
      throw new ApiError('Network request failed. Please check your internet connection.', 0);
    }
    throw new ApiError(err.message || 'An unexpected error occurred.', 500);
  }
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export const api = {
  // Auth
  signup: (email: string, username: string, password: string, phone: string, referral_code?: string) =>
    request<{ success: boolean; message: string; email: string; requiresOtp?: boolean; resendCooldown?: number; token?: string; user?: User }>('/auth/signup/initiate', {
      method: 'POST', body: JSON.stringify({ email, username, password, phone, referral_code }),
    }),
  signupVerify: (email: string, code: string, referral_code?: string) =>
    request<{ success: boolean; token: string; user: User; referralMessage?: string; message: string }>('/auth/signup/verify', {
      method: 'POST', body: JSON.stringify({ email, code, referral_code }),
    }),
  resendOtp: (email: string, purpose: string = 'signup') =>
    request<{ success: boolean; message: string; resendCooldown: number }>('/auth/otp/resend', {
      method: 'POST', body: JSON.stringify({ email, purpose }),
    }),
  login: (identifier: string, password: string) =>
    request<{ success: boolean; token: string; user: User }>('/auth/login', { 
      method: 'POST', body: JSON.stringify({ identifier, password }) 
    }),
  forgotPasswordRequest: (email: string) =>
    request<{ success: boolean; message: string }>('/auth/forgot-password/request', {
      method: 'POST', body: JSON.stringify({ email }),
    }),
  forgotPasswordReset: (email: string, code: string, new_password: string) =>
    request<{ success: boolean; message: string }>('/auth/forgot-password/reset', {
      method: 'POST', body: JSON.stringify({ email, code, new_password }),
    }),
  logoutAll: (token: string) =>
    request<{ success: boolean; message: string }>('/auth/logout-all', { method: 'POST' }, token),
  me: (token: string) => request<User>('/auth/me', {}, token),

  // Notifications
  getNotifications: (token: string) =>
    request<{ notifications: NotificationItem[]; unreadCount: number }>('/notifications', {}, token),
  markNotificationsRead: (notification_id?: number, token?: string) =>
    request<{ success: boolean }>('/notifications/read', { method: 'POST', body: JSON.stringify({ notification_id }) }, token),
  clearNotifications: (token: string) =>
    request<{ success: boolean }>('/notifications/clear', { method: 'DELETE' }, token),

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

  // Customer Care / Support — User
  getFaqs: (token?: string, category?: string, q?: string) => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (q) params.append('q', q);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return request<{ faqs: SupportFaq[] }>(`/support/faqs${queryStr}`, {}, token);
  },
  getFaqDetail: (id: number, token?: string) =>
    request<{ faq: SupportFaq }>(`/support/faqs/${id}`, {}, token),
  getUserTickets: (token: string, status?: string) => {
    const queryStr = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<{ tickets: SupportTicket[] }>(`/support/tickets${queryStr}`, {}, token);
  },
  createTicket: (data: { category: string; subject: string; message: string; related_transaction_id?: number; attachment_data?: string }, token: string) =>
    request<{ success: boolean; ticket: SupportTicket }>(`/support/tickets`, { method: 'POST', body: JSON.stringify(data) }, token),
  getTicketDetail: (id: number, token: string) =>
    request<{ ticket: SupportTicketDetail }>(`/support/tickets/${id}`, {}, token),
  sendTicketMessage: (id: number, message: string, attachment_data?: string, token?: string) =>
    request<{ success: boolean; message: SupportMessage }>(`/support/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify({ message, attachment_data }) }, token),
  closeTicket: (id: number, token: string) =>
    request<{ success: boolean; message: string }>(`/support/tickets/${id}/close`, { method: 'POST' }, token),

  // Customer Care / Support — Admin
  getAdminTickets: (token: string, filters?: { status?: string; priority?: string; category?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.search) params.append('search', filters.search);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return request<{ total: number; counts: { open: number; in_progress: number; resolved: number; closed: number }; tickets: SupportTicket[] }>(`/admin/support/tickets${queryStr}`, {}, token);
  },
  getAdminTicketDetail: (id: number, token: string) =>
    request<{ ticket: SupportTicketDetail }>(`/admin/support/tickets/${id}`, {}, token),
  sendAdminTicketMessage: (id: number, message: string, attachment_data?: string, token?: string) =>
    request<{ success: boolean; message: SupportMessage }>(`/admin/support/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify({ message, attachment_data }) }, token),
  updateAdminTicket: (id: number, data: { status?: string; priority?: string }, token: string) =>
    request<{ success: boolean; ticket: SupportTicket }>(`/admin/support/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  getAdminFaqs: (token: string) =>
    request<{ faqs: SupportFaq[] }>(`/admin/support/faqs`, {}, token),
  createAdminFaq: (data: { category: string; question: string; answer: string }, token: string) =>
    request<{ success: boolean; faq: SupportFaq }>(`/admin/support/faqs`, { method: 'POST', body: JSON.stringify(data) }, token),
  updateAdminFaq: (id: number, data: { category?: string; question?: string; answer?: string; is_active?: boolean }, token: string) =>
    request<{ success: boolean; faq: SupportFaq }>(`/admin/support/faqs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  deleteAdminFaq: (id: number, token: string) =>
    request<{ success: boolean; message: string }>(`/admin/support/faqs/${id}`, { method: 'DELETE' }, token),
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  username: string;
  role?: string;
  phone?: string;
  coinBalance: number;
  isVerified?: boolean;
  status?: string;
  isFlagged?: boolean;
  referralCode?: string;
  reservedBankName?: string;
  reservedAccountNumber?: string;
  reservedAccountName?: string;
  createdAt?: string;
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

export interface SupportFaq {
  id: number;
  category: string;
  question: string;
  answer: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupportMessage {
  id: number;
  ticket_id: number;
  sender_id: number | null;
  sender_type: 'USER' | 'ADMIN' | 'AI' | 'WHATSAPP';
  message: string;
  attachment_url?: string | null;
  created_at: string;
  read_at?: string | null;
}

export interface SupportTicket {
  id: number;
  ticket_number: string;
  user_id: number;
  category: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  related_transaction_id?: number | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  closed_at?: string | null;
  unread_admin_count?: number;
  unread_user_count?: number;
  last_message?: string;
  username?: string;
  email?: string;
}

export interface SupportTicketDetail extends SupportTicket {
  messages: SupportMessage[];
  user?: { id: number; username: string; email: string; phone?: string; coin_balance: number };
  related_transaction?: {
    id: number;
    type: string;
    amount_coins: number;
    amount_ngn: number;
    description: string;
    reference: string;
    status: string;
    created_at: string;
  } | null;
}

