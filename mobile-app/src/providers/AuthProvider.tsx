// mobile-app/src/providers/AuthProvider.tsx

import firebase from "@react-native-firebase/app";
import appCheck from "@react-native-firebase/app-check";
import { Session } from "@supabase/supabase-js";
import React, { createContext, useState, useEffect, useContext } from "react";
import { Platform } from "react-native";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";
// Note: We no longer need expo-constants here since push notifications are removed.

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  signIn: () => Promise<void>;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      if (__DEV__) {
        console.log("DEV mode: Skipping App Check, signing in directly.");
      } else {
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
      
      // **THE FIX:** The push notification logic has been removed from the sign-in flow.
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) throw signInError;
      
    } catch (error: any) { // Changed 'error' to 'any' to access '.message'
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

// **THE FIX:** The entire 'registerForPushNotificationsAsync' function has been removed.

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};