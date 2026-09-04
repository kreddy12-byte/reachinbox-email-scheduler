const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface SlackStatus {
  connected: boolean;
  teamId?: string;
  teamName?: string | null;
  channelId?: string | null;
}

export function getSlackConnectUrl(): string {
  return `${API_URL}/api/slack/oauth`;
}

export async function getSlackStatus(): Promise<SlackStatus> {
  const response = await fetch(`${API_URL}/api/slack/status`, {
    method: 'GET',
    credentials: 'include',
  });

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to load Slack status');
  }

  const payload = (await response.json()) as {
    success: boolean;
    data: SlackStatus;
  };

  return payload.data;
}

export async function disconnectSlack(): Promise<void> {
  const response = await fetch(`${API_URL}/api/slack/disconnect`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to disconnect Slack');
  }
}
