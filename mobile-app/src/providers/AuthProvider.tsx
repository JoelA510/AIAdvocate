// mobile-app/src/providers/AuthProvider.tsx

import React, { createContext, useContext, useState, useEffect } from "react";
import { Platform } from "react-native";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import Toast from "react-native-toast-message";
import { registerForPushNotificationsAsync } from "../lib/push";
import { captureException } from "../lib/sentry";

type AuthContextType = {
  session: Session | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      let recoveryError: any = null;

      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          // getSession() failed (e.g. an expired/invalid stored refresh
          // token) -- still attempt anonymous sign-in as a recovery path
          // instead of leaving the user with no session forever.
          captureException(error, { context: "auth_initialization_get_session" });
          recoveryError = error;
        } else if (session && session.user.is_anonymous === false && Platform.OS !== "web") {
          // Staff email/password sessions belong to the web admin surface
          // only. A session persisted from a build that still had native
          // admin login would otherwise keep an email-bearing token on the
          // device forever (no native sign-out path exists anymore), so
          // replace it with the anonymous session every public user gets.
          //
          // `=== false` (not `!== true`) is deliberate: a session whose user
          // lacks the is_anonymous flag must be KEPT — signing out an
          // anonymous user permanently orphans their bookmarks/reactions,
          // while a missed staff session is only deferred cleanup (the flag
          // arrives with the next token refresh and this check re-runs).
          await supabase.auth.signOut();
          // fall through to anonymous sign-in below
        } else {
          setSession(session);
          if (session) return;
        }

        // No session (either getSession() errored, or it succeeded but
        // returned null): sign in anonymously. The onAuthStateChange
        // listener will pick up the new session.
        const { error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) throw signInError;
      } catch (error: any) {
        const reported = recoveryError ?? error;
        // Send to Sentry for monitoring
        captureException(reported, { context: "auth_initialization" });

        // In development, log full error
        if (__DEV__) {
          console.error("Auto sign-in failed:", reported);
        } else {
          // In production, only log sanitized message
          console.error("Authentication failed");
        }

        Toast.show({
          type: "error",
          text1: "Authentication Failed",
          text2: __DEV__ ? reported?.message : "Please try again",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Effect to register for push notifications once the session is loaded
  useEffect(() => {
    if (session?.user?.id) {
      registerForPushNotificationsAsync(session.user.id).catch((error: any) => {
        // Send to Sentry
        captureException(error, { context: "push_notification_registration" });

        if (__DEV__) {
          console.warn("Failed to register for push notifications:", error);
        }
      });
    }
  }, [session]);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
