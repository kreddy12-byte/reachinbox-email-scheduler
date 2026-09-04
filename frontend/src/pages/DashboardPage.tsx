import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ComposeEmailModal } from '../components/dashboard/ComposeEmailModal';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import {
  EmailTable,
  toScheduledRows,
  toSentRows,
} from '../components/dashboard/EmailTable';
import { EmailTabs, type EmailTab } from '../components/dashboard/EmailTabs';
import { Header } from '../components/dashboard/Header';
import { SearchBar } from '../components/dashboard/SearchBar';
import { SlackIntegration } from '../components/dashboard/SlackIntegration';
import { StatusBadge } from '../components/dashboard/StatusBadge';
import { SummaryCards } from '../components/dashboard/SummaryCards';
import type { AuthUser } from '../services/auth.service';
import {
  getScheduledEmails,
  getSentEmails,
  searchEmails,
  type EmailStatus,
  type ScheduledEmail,
  type SearchEmailItem,
  type SentEmail,
} from '../services/email.service';
import { listSenders } from '../services/sender.service';
import {
  disconnectSlack,
  getSlackStatus,
  type SlackStatus,
} from '../services/slack.service';
import { formatDateTime } from '../utils/format';

interface DashboardPageProps {
  user: AuthUser;
  onLogout: () => Promise<void>;
}

export function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<EmailTab>('scheduled');
  const [composeOpen, setComposeOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const [scheduled, setScheduled] = useState<ScheduledEmail[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(true);
  const [scheduledError, setScheduledError] = useState<string | null>(null);

  const [sent, setSent] = useState<SentEmail[]>([]);
  const [sentLoading, setSentLoading] = useState(true);
  const [sentError, setSentError] = useState<string | null>(null);

  const [senderCount, setSenderCount] = useState(0);
  const [sendersLoading, setSendersLoading] = useState(true);

  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);
  const [slackLoading, setSlackLoading] = useState(true);
  const [slackMessage, setSlackMessage] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState<EmailStatus | ''>('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchEmailItem[] | null>(
    null,
  );

  const failedCount = useMemo(
    () => sent.filter((email) => email.status === 'FAILED').length,
    [sent],
  );
  const sentOnlyCount = useMemo(
    () => sent.filter((email) => email.status === 'SENT').length,
    [sent],
  );

  const loadScheduled = useCallback(async () => {
    setScheduledLoading(true);
    setScheduledError(null);
    try {
      const emails = await getScheduledEmails();
      setScheduled(emails);
    } catch (error) {
      setScheduledError(
        error instanceof Error
          ? error.message
          : 'Failed to load scheduled emails',
      );
    } finally {
      setScheduledLoading(false);
    }
  }, []);

  const loadSent = useCallback(async () => {
    setSentLoading(true);
    setSentError(null);
    try {
      const emails = await getSentEmails();
      setSent(emails);
    } catch (error) {
      setSentError(
        error instanceof Error ? error.message : 'Failed to load sent emails',
      );
    } finally {
      setSentLoading(false);
    }
  }, []);

  const loadSenders = useCallback(async () => {
    setSendersLoading(true);
    try {
      const senders = await listSenders();
      setSenderCount(senders.length);
    } catch {
      setSenderCount(0);
    } finally {
      setSendersLoading(false);
    }
  }, []);

  const loadSlack = useCallback(async () => {
    setSlackLoading(true);
    try {
      const status = await getSlackStatus();
      setSlackStatus(status);
    } catch {
      setSlackStatus({ connected: false });
    } finally {
      setSlackLoading(false);
    }
  }, []);

  useEffect(() => {
    const slackResult = searchParams.get('slack');
    if (slackResult === 'connected') {
      setSlackMessage('Slack connected successfully.');
    } else if (slackResult === 'error' || slackResult === 'invalid_state') {
      setSlackMessage('Slack connection failed. Please try again.');
    }

    if (slackResult) {
      const next = new URLSearchParams(searchParams);
      next.delete('slack');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    void loadScheduled();
    void loadSent();
    void loadSenders();
    void loadSlack();
  }, [loadScheduled, loadSent, loadSenders, loadSlack]);

  async function handleSearch() {
    setSearching(true);
    setSearchError(null);
    try {
      const result = await searchEmails({
        q: searchQuery,
        status: searchStatus || undefined,
        page: 1,
        limit: 50,
      });
      setSearchResults(result.items);
    } catch (error) {
      setSearchResults(null);
      setSearchError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await disconnectSlack();
      setSlackStatus({ connected: false });
      setSlackMessage('Slack disconnected.');
    } catch {
      setSlackMessage('Failed to disconnect Slack.');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <DashboardLayout
      header={
        <Header
          user={user}
          onLogout={() => {
            void onLogout();
          }}
          onCompose={() => setComposeOpen(true)}
        />
      }
    >
      {banner ? (
        <div
          className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
          role="status"
        >
          {banner}
          <button
            type="button"
            className="ml-3 text-emerald-700 underline"
            onClick={() => setBanner(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="mb-6">
        <SummaryCards
          scheduled={scheduled.length}
          sent={sentOnlyCount}
          failed={failedCount}
          senders={senderCount}
          loading={scheduledLoading || sentLoading || sendersLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--ri-ink)]">
                Outreach Dashboard
              </h1>
              <p className="mt-1 text-sm text-[var(--ri-muted)]">
                Schedule campaigns, track delivery, and search your emails.
              </p>
            </div>
            <EmailTabs
              active={tab}
              onChange={(next) => {
                setTab(next);
                setSearchResults(null);
                setSearchError(null);
              }}
              scheduledCount={scheduled.length}
              sentCount={sent.length}
            />
          </div>

          <div className="rounded-[var(--ri-radius)] border border-[var(--ri-border)] bg-[var(--ri-surface)] p-4 shadow-[var(--ri-shadow)]">
            <SearchBar
              query={searchQuery}
              status={searchStatus}
              onQueryChange={setSearchQuery}
              onStatusChange={setSearchStatus}
              onSubmit={() => {
                void handleSearch();
              }}
              searching={searching}
            />
            {searchError ? (
              <p className="mt-3 text-sm text-rose-700">{searchError}</p>
            ) : null}
            {searchResults ? (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--ri-ink)]">
                    Search results ({searchResults.length})
                  </p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--ri-muted)] hover:text-[var(--ri-ink)]"
                    onClick={() => {
                      setSearchResults(null);
                      setSearchError(null);
                    }}
                  >
                    Clear results
                  </button>
                </div>
                {searchResults.length === 0 ? (
                  <p className="text-sm text-[var(--ri-muted)]">
                    No emails matched your search.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-[var(--ri-border)]">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--ri-muted)]">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Recipient</th>
                          <th className="px-3 py-2 font-semibold">Subject</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Scheduled</th>
                          <th className="px-3 py-2 font-semibold">Sent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchResults.map((item) => (
                          <tr
                            key={item.id}
                            className="border-t border-[var(--ri-border)] hover:bg-slate-50/70"
                          >
                            <td className="px-3 py-2 font-medium">
                              {item.recipient}
                            </td>
                            <td className="max-w-[220px] truncate px-3 py-2">
                              {item.subject}
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge status={item.status} />
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-[var(--ri-muted)]">
                              {formatDateTime(item.scheduledAt)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-[var(--ri-muted)]">
                              {formatDateTime(item.sentAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {tab === 'scheduled' ? (
            <EmailTable
              mode="scheduled"
              rows={toScheduledRows(scheduled)}
              loading={scheduledLoading}
              error={scheduledError}
              onRetry={() => {
                void loadScheduled();
              }}
              onCompose={() => setComposeOpen(true)}
            />
          ) : (
            <EmailTable
              mode="sent"
              rows={toSentRows(sent)}
              loading={sentLoading}
              error={sentError}
              onRetry={() => {
                void loadSent();
              }}
            />
          )}
        </section>

        <aside className="space-y-4">
          <SlackIntegration
            status={slackStatus}
            loading={slackLoading}
            message={slackMessage}
            disconnecting={disconnecting}
            onDisconnect={() => {
              void handleDisconnect();
            }}
          />
        </aside>
      </div>

      <ComposeEmailModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onScheduled={(count) => {
          setBanner(
            `Successfully scheduled ${count} email${count === 1 ? '' : 's'}.`,
          );
          setTab('scheduled');
          void loadScheduled();
          void loadSent();
          void loadSenders();
        }}
      />
    </DashboardLayout>
  );
}
