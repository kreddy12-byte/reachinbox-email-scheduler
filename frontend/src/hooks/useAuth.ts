import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUser,
  logout as logoutRequest,
  type AuthUser,
} from '../services/auth.service';

interface UseAuthResult {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const current = await getCurrentUser();
      setUser(current);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
  }, []);

  return { user, loading, refresh, logout };
}
