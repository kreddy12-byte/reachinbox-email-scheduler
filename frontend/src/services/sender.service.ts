const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface Sender {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export async function listSenders(): Promise<Sender[]> {
  const response = await fetch(`${API_URL}/api/senders`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to load senders');
  }

  const payload = (await response.json()) as {
    success: boolean;
    data: { senders: Sender[] };
  };

  return payload.data.senders;
}
