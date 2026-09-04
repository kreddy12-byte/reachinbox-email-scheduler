import { getGoogleLoginUrl } from '../services/auth.service';

export function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-md rounded-[var(--ri-radius)] border border-[var(--ri-border)] bg-[var(--ri-surface)] p-8 text-center shadow-[var(--ri-shadow)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ri-primary)] text-sm font-bold text-white">
          RI
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--ri-ink)]">
          ReachInbox
        </h1>
        <p className="mt-3 text-sm text-[var(--ri-muted)]">
          Sign in with Google to schedule and manage outreach emails.
        </p>
        <a
          href={getGoogleLoginUrl()}
          className="mt-8 inline-flex items-center justify-center rounded-xl bg-[var(--ri-ink)] px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Continue with Google
        </a>
      </section>
    </main>
  );
}
