import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { forgetDiscordAuthorization, hasDiscordIdentity, isStaffSession, rememberDiscordAuthorization } from "../lib/session";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  isStaff: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const initialAuthParams = typeof window === "undefined" ? "" : `${window.location.search}${window.location.hash}`;

function returnedWithAuthError(): boolean {
  if (!initialAuthParams) return false;
  const [query = "", hash = ""] = initialAuthParams.split("#");
  return [new URLSearchParams(query.replace(/^\?/, "")), new URLSearchParams(hash)].some(
    (params) => params.has("error") || params.has("error_description") || params.has("error_code")
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session && !data.session.user.is_anonymous) {
        supabase.auth
          .getUser()
          .then(({ data: fresh }) => {
            if (fresh.user) setSession((current) => (current ? { ...current, user: fresh.user } : current));
          })
          .catch(() => undefined);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (returnedWithAuthError()) forgetDiscordAuthorization();
  }, []);

  useEffect(() => {
    if (hasDiscordIdentity(session)) rememberDiscordAuthorization();
  }, [session]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: "local" });
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, isStaff: isStaffSession(session), signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
