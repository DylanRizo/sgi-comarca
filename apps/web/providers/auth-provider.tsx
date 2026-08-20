'use client';

import type {
  AuthenticationData,
  ChangePasswordRequest,
  CurrentSessionData,
} from '@sgi/contracts';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { authApi } from '@/lib/http/auth-api';
import { ApiHttpError } from '@/lib/http/api-client';

type AnonymousReason = 'expired' | 'logout' | 'missing' | 'password-change';

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'anonymous'; reason: AnonymousReason }
  | {
      csrfToken: string | null;
      kind: 'authenticated';
      session: CurrentSessionData;
    };

type AuthContextValue = {
  changePassword: (input: ChangePasswordRequest) => Promise<void>;
  establish: (result: AuthenticationData) => Promise<void>;
  getCsrfToken: (forceRefresh?: boolean) => Promise<string>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  state: AuthState;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<AuthState>({ kind: 'loading' });
  const stateRef = useRef<AuthState>(state);
  const authenticatedOnce = useRef(false);
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const updateState = useCallback((next: AuthState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const markAnonymous = useCallback(
    (reason?: AnonymousReason) => {
      updateState({
        kind: 'anonymous',
        reason: reason ?? (authenticatedOnce.current ? 'expired' : 'missing'),
      });
    },
    [updateState],
  );

  const refreshSession = useCallback(async () => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const refresh = (async () => {
      try {
        const session = await authApi.session();
        authenticatedOnce.current = true;
        const current = stateRef.current;
        updateState({
          csrfToken:
            current.kind === 'authenticated' ? current.csrfToken : null,
          kind: 'authenticated',
          session,
        });
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 401) {
          markAnonymous();
          return;
        }
        throw error;
      }
    })().finally(() => {
      refreshInFlight.current = null;
    });
    refreshInFlight.current = refresh;
    return refresh;
  }, [markAnonymous, updateState]);

  useEffect(() => {
    void refreshSession().catch(() => markAnonymous('missing'));
  }, [markAnonymous, refreshSession]);

  useEffect(() => {
    const handleFocus = () => {
      if (stateRef.current.kind === 'authenticated') {
        void refreshSession().catch(() => undefined);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshSession]);

  const establish = useCallback(
    async (result: AuthenticationData) => {
      const session = await authApi.session();
      authenticatedOnce.current = true;
      updateState({
        csrfToken: result.csrfToken,
        kind: 'authenticated',
        session,
      });
    },
    [updateState],
  );

  const getCsrfToken = useCallback(
    async (forceRefresh = false): Promise<string> => {
      const current = stateRef.current;
      if (current.kind !== 'authenticated') {
        throw new ApiHttpError(401, 'SESSION_INVALID', 'Session unavailable.');
      }
      if (!forceRefresh && current.csrfToken) return current.csrfToken;

      try {
        const result = await authApi.csrf();
        updateState({ ...current, csrfToken: result.csrfToken });
        return result.csrfToken;
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 401) {
          markAnonymous('expired');
        }
        throw error;
      }
    },
    [markAnonymous, updateState],
  );

  const logout = useCallback(async () => {
    try {
      const token = await getCsrfToken();
      try {
        await authApi.logout(token);
      } catch (error) {
        if (
          error instanceof ApiHttpError &&
          error.status === 403 &&
          error.code === 'REQUEST_VERIFICATION_FAILED'
        ) {
          await authApi.logout(await getCsrfToken(true));
        } else {
          throw error;
        }
      }
    } catch (error) {
      if (!(error instanceof ApiHttpError && error.status === 401)) throw error;
    } finally {
      authenticatedOnce.current = false;
      markAnonymous('logout');
    }
  }, [getCsrfToken, markAnonymous]);

  const changePassword = useCallback(
    async (input: ChangePasswordRequest) => {
      try {
        await authApi.changePassword(input, await getCsrfToken());
        authenticatedOnce.current = false;
        markAnonymous('password-change');
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 401) {
          markAnonymous('expired');
        }
        throw error;
      }
    },
    [getCsrfToken, markAnonymous],
  );

  return (
    <AuthContext.Provider
      value={{
        changePassword,
        establish,
        getCsrfToken,
        logout,
        refreshSession,
        state,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
