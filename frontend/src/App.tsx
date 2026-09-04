import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';

function FullPageLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-[var(--ri-muted)]">Loading…</p>
    </main>
  );
}

function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return <FullPageLoading />;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        path="/dashboard"
        element={
          user ? (
            <DashboardPage
              user={user}
              onLogout={async () => {
                await logout();
              }}
            />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/'} replace />} />
    </Routes>
  );
}

export default App;
