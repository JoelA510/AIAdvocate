// mobile-app/src/providers/AuthProvider.tsx

import React, { createContext, useState, useEffect, useContext } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import Toast from "react-native-toast-message";
// Note: We are removing Firebase dependencies as they are no longer used here.

interface AuthContextType {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      // --- NEW AUTONOMOUS LOGIC ---
      // If there's no session after the initial check, sign in anonymously.
      if (!session) {
        setLoading(true); // Ensure loading is true while we sign in
        try {
          // In DEV, we can just sign in.
          // In a real PROD app, you might re-introduce App Check here if needed,
          // but for anonymous auth, it's often omitted for simplicity.
          const { error: signInError } = await supabase.auth.signInAnonymously();
          if (signInError) throw signInError;
          // The onAuthStateChange listener below will handle setting the new session.
        } catch (error: any) {
          console.error("Auto sign-in failed:", error);
          Toast.show({ type: "error", text1: "Authentication Failed", text2: error.message });
        }
      }
      setLoading(false);
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // We no longer need to export the `signIn` function from the context.
  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};