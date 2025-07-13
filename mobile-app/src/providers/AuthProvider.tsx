import firebase from "@react-native-firebase/app";
import appCheck from "@react-native-firebase/app-check";
import { Session } from "@supabase/supabase-js";
import React, { createContext, useState, useEffect, useContext } from "react";
import { Platform } from "react-native";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  signIn: () => Promise<void>;
  // We remove isReady as it's no longer needed with this simpler flow
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- Firebase Web Config ---
let firebaseConfig;
if (Platform.OS === 'web') {
  try {
    firebaseConfig = JSON.parse(process.env.EXPO_PUBLIC_FIREBASE_WEB_CONFIG!);
  } catch (e) {
    console.error("Failed to parse EXPO_PUBLIC_FIREBASE_WEB_CONFIG from .env");
  }
}
// -------------------------

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // This effect only checks for an existing session and sets up the listener.
    // All sign-in logic is now handled by the signIn function.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    setLoading(true);
    try {
      // --- THIS IS THE KEY CHANGE ---
      // If we are in development mode, skip all verification.
      if (__DEV__) {
        console.log("DEV mode: Skipping App Check, signing in directly.");
      } else {
        // In PRODUCTION, run the full App Check flow.
        if (Platform.OS !== 'web') {
          if (firebase.apps.length === 0) {
            await firebase.initializeApp(Platform.OS === 'web' ? firebaseConfig : undefined);
          }
          await appCheck().activate("ignored", true);
          const { token } = await appCheck().getToken(true);
          if (!token) throw new Error("Production Error: Could not get App Check token.");

          const { data, error: functionError } = await supabase.functions.invoke("verify-app-check", {
            body: { appCheckToken: token },
          });
          if (functionError || !data?.success) throw functionError || new Error("Production Error: Edge function verification failed.");
        }
      }
      
      // This part runs for both DEV and PROD (after verification)
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) throw signInError;
      
    } catch (error) {
      console.error("Sign-in process failed:", error);
      Toast.show({ type: "error", text1: "Sign-In Failed", text2: error.message });
    } finally {
      setLoading(false);
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