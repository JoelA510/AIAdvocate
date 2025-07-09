import { Session } from "@supabase/supabase-js";
import React, { createContext, useState, useEffect, useContext } from "react";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";
import appCheck from "@react-native-firebase/app-check";
import firebase from "@react-native-firebase/app";

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  signIn: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAppCheck = async () => {
      if (firebase.apps.length === 0) {
        await firebase.initializeApp();
      }
      const rnfbAppCheck = appCheck();
      await rnfbAppCheck.activate(process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY, true);
    };

    initializeAppCheck();

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

  const signIn = async () => {
    try {
      const { token } = await appCheck().getToken(true);

      const response = await fetch(process.env.EXPO_PUBLIC_SUPABASE_URL + "/functions/v1/verify-app-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Firebase-AppCheck": token,
        },
      });

      if (!response.ok) {
        throw new Error("App Check verification failed");
      }

      const { error } = await supabase.auth.signInAnonymously();

      if (error) {
        throw new Error(error.message);
      }

      Toast.show({
        type: "success",
        text1: "Verification successful!",
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Login Failed",
        text2: error.message,
      });
      console.error("Error signing in:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn }}>
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
