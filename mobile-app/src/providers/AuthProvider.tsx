// mobile-app/src/providers/AuthProvider.tsx

import React, { createContext, useContext, useState, useEffect } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import Toast from "react-native-toast-message";
// NEW: Import our push notification registration function
import { registerForPushNotificationsAsync } from '../lib/push';

type AuthContextType = {
  session: Session | null;
  loading: boolean;
};

// Use the slightly cleaner context creation from the proposed version
const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      
      // If there's no session, we need to sign in anonymously.
      if (!session) {
        try {
          // Re-instating the robust error handling from your original file
          const { error: signInError } = await supabase.auth.signInAnonymously();
          if (signInError) throw signInError;
          // The onAuthStateChange listener will pick up the new session.
        } catch (error: any) {
          console.error("Auto sign-in failed:", error);
          Toast.show({ type: "error", text1: "Authentication Failed", text2: error.message });
        }
      }
      setLoading(false);
    };

    fetchSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false); // Also set loading to false when the session changes
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // NEW: Effect to register for push notifications once the session is loaded
  useEffect(() => {
    if (session?.user?.id) {
      // We have a user, let's register their device for notifications
      registerForPushNotificationsAsync(session.user.id);
    }
  }, [session]); // This effect runs whenever the session changes

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Use the slightly cleaner useAuth hook from the proposed version
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};