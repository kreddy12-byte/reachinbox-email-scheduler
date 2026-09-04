export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export function getGoogleLoginUrl(): string {
  return `${API_URL}/api/auth/google`;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    method: 'GET',
    credentials: 'include',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to load current user');
  }

  const payload = await parseJson<{
    success: boolean;
    data: AuthUser;
  }>(response);

  return payload.data;
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok && response.status !== 401) {
    throw new Error('Failed to logout');
  }
}
