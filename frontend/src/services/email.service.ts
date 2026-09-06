const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export type EmailStatus = 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED';

export interface EmailSenderInfo {
  id: string;
  email: string;
  displayName: string | null;
}

export interface ScheduledEmail {
  id: string;
  recipient: string;
  subject: string;
  scheduledAt: string;
  status: EmailStatus;
  sendDelayMs: number;
  hourlyLimit: number;
  createdAt: string;
  sender: EmailSenderInfo;
}

export interface SentEmail {
  id: string;
  recipient: string;
  subject: string;
  sentAt: string | null;
  status: EmailStatus;
  createdAt: string;
  sender: EmailSenderInfo;
}

export interface SearchEmailItem {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleEmailItem {
  senderId?: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sendDelayMs?: number;
  hourlyLimit?: number;
}

export interface ScheduleResult {
  emailId: string;
  scheduledAt: string;
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof payload.error === 'string') return payload.error;
    if (payload.error && typeof payload.error === 'object' && payload.error.message) {
      return payload.error.message;
    }
    return payload.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export async function getScheduledEmails(): Promise<ScheduledEmail[]> {
  const response = await fetch(`${API_URL}/api/emails/scheduled`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const payload = (await response.json()) as {
    success: boolean;
    data: { emails: ScheduledEmail[] };
  };

  return payload.data.emails;
}

export async function getSentEmails(): Promise<SentEmail[]> {
  const response = await fetch(`${API_URL}/api/emails/sent`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const payload = (await response.json()) as {
    success: boolean;
    data: { emails: SentEmail[] };
  };

  return payload.data.emails;
}

export async function scheduleEmails(
  emails: ScheduleEmailItem[],
): Promise<ScheduleResult[]> {
  const response = await fetch(`${API_URL}/api/emails/schedule`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const payload = (await response.json()) as {
    success: boolean;
    data: { scheduled: ScheduleResult[] };
  };

  return payload.data.scheduled;
}

export async function searchEmails(input: {
  q?: string;
  status?: EmailStatus;
  page?: number;
  limit?: number;
}): Promise<{
  items: SearchEmailItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const params = new URLSearchParams();
  if (input.q?.trim()) params.set('q', input.q.trim());
  if (input.status) params.set('status', input.status);
  if (input.page) params.set('page', String(input.page));
  if (input.limit) params.set('limit', String(input.limit));

  const response = await fetch(
    `${API_URL}/api/emails/search?${params.toString()}`,
    {
      method: 'GET',
      credentials: 'include',
    },
  );

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const payload = (await response.json()) as {
    success: boolean;
    data: {
      items: SearchEmailItem[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    };
  };

  return payload.data;
}
