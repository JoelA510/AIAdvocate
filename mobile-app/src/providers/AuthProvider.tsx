// mobile-app/src/providers/AuthProvider.tsx

import React, { createContext, useContext, useState, useEffect } from "react";
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
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) throw error;

        setSession(session);

        // If there's no session, we need to sign in anonymously.
        if (!session) {
          const { error: signInError } = await supabase.auth.signInAnonymously();
          if (signInError) throw signInError;
          // The onAuthStateChange listener will pick up the new session.
        }
      } catch (error: any) {
        // Send to Sentry for monitoring
        captureException(error, { context: "auth_initialization" });

        // In development, log full error
        if (__DEV__) {
          console.error("Auto sign-in failed:", error);
        } else {
          // In production, only log sanitized message
          console.error("Authentication failed");
        }

        Toast.show({
          type: "error",
          text1: "Authentication Failed",
          text2: __DEV__ ? error.message : "Please try again",
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
