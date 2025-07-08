import { Session } from "@supabase/supabase-js";
import React, { createContext, useState, useEffect, useContext } from "react";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  // NEW: Expose the sign-in function
  signInWithCaptcha: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // This effect now only checks for an existing session and sets up the listener.
  // It no longer tries to sign in automatically.
  useEffect(() => {
    const fetchSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };

    fetchSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // NEW: This function will be called by our LoginScreen
  const signInWithCaptcha = async (token: string) => {
    const { error } = await supabase.auth.signInAnonymously({
      options: {
        captchaToken: token,
      },
    });

    if (error) {
      Toast.show({
        type: "error",
        text1: "Login Failed",
        text2: error.message,
      });
      console.error("Error signing in with captcha:", error);
    } else {
      Toast.show({
        type: "success",
        text1: "Verification successful!",
      });
    }
  };

  return (
    <AuthContext.Provider value={{ session, loading, signInWithCaptcha }}>
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