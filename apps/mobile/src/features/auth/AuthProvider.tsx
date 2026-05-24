import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

interface AuthState {
  /** null = not signed in, undefined = still loading on app boot. */
  session: Session | null | undefined;
  user: User | null;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthState>({
  session: undefined,
  user: null,
  signOut: async () => {},
});

/**
 * Wrap the app root. Hydrates from AsyncStorage on mount, then
 * subscribes to Supabase auth events so sign-in / sign-out from any
 * screen propagates here without needing to lift the listener into
 * each screen.
 *
 * `session === undefined` is the "still figuring out if we're signed
 * in" boot state — the root layout uses this to render a splash
 * instead of flashing the sign-in screen for users who already have a
 * persisted session.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null | undefined>(
    undefined,
  );

  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) setSession(next);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = React.useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return React.useContext(AuthContext);
}
