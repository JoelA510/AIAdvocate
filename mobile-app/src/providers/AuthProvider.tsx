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
  isReady: boolean; // NEW: Flag to signal when auth is ready
  signIn: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- Get Firebase Config for Web ---
let firebaseConfig;
if (Platform.OS === 'web') {
  try {
    firebaseConfig = JSON.parse(process.env.EXPO_PUBLIC_FIREBASE_WEB_CONFIG!);
  } catch (e) {
    console.error("Failed to parse EXPO_PUBLIC_FIREBASE_WEB_CONFIG from .env");
  }
}
// ------------------------------------

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false); // NEW

  useEffect(() => {
    const initialize = async () => {
      try {
        console.log("1. Initializing Firebase...");
        if (firebase.apps.length === 0) {
          // Use the config object for web, or let it auto-configure on native
          await firebase.initializeApp(Platform.OS === 'web' ? firebaseConfig : undefined);
        }
        console.log("Firebase initialized.");

        console.log("2. Activating App Check...");
        await appCheck().activate("ignored", true);
        console.log("App Check activated.");

        // If initialization succeeds, set the ready flag
        setIsReady(true);

      } catch (e) {
        console.error("Firebase or App Check initialization failed:", e);
        Toast.show({ type: 'error', text1: 'Initialization Failed', text2: e.message });
      }

      console.log("3. Checking for existing Supabase session...");
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
      console.log(session ? "Session found." : "No session found.");
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    if (!isReady) {
      console.warn("Auth not ready, sign-in aborted.");
      return;
    }
    setLoading(true);
    try {
      const { token } = await appCheck().getToken(true);
      if (!token) throw new Error("Could not get App Check token.");

      const { data, error: functionError } = await supabase.functions.invoke("verify-app-check", {
        body: { appCheckToken: token },
      });
      if (functionError || !data?.success) throw functionError || new Error("Edge function verification failed.");

      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) throw signInError;
      
      Toast.show({ type: "success", text1: "Verified!" });
    } catch (error) {
      console.error("Sign-in process failed:", error);
      Toast.show({ type: "error", text1: "Sign-In Failed", text2: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ session, loading, isReady, signIn }}>
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