function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveBaseUrl(envKey: string, fallback: string): string {
  const candidate = process.env[envKey];
  try {
    return normalizeBaseUrl(new URL(candidate || fallback).origin);
  } catch {
    return normalizeBaseUrl(fallback);
  }
}

export function getFrontendBaseUrl(): string {
  return resolveBaseUrl('E2E_FRONTEND_URL', 'http://localhost:5173');
}

export function getBackendBaseUrl(): string {
  return resolveBaseUrl('E2E_BACKEND_URL', 'http://localhost:3000');
}

export function buildBackendUrl(path: string): string {
  const baseUrl = getBackendBaseUrl();
  if (!path) return baseUrl;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
