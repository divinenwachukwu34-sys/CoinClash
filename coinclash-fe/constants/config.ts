const rawUrl = process.env.API_URL || process.env.EXPO_PUBLIC_API_URL || 'https://coinclash.saverr.tech';
const cleanUrl = rawUrl.replace(/\/+$/, '');

// Centralized API Base URL (ensures /api route prefix)
export const API_BASE_URL = cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
export const RAW_API_URL = cleanUrl;

/**
 * Returns a WebSocket URL based on the API_BASE_URL, replacing http(s) with ws(s).
 */
export const getWsUrl = (path: string): string => {
  const wsProtocol = RAW_API_URL.startsWith('https') ? 'wss' : 'ws';
  const baseUrl = RAW_API_URL.replace(/^https?/, wsProtocol);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};
