import firebase from "@react-native-firebase/app";
import appCheck from "@react-native-firebase/app-check";
import { Session } from "@supabase/supabase-js";
import React, { createContext, useState, useEffect, useContext } from "react";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";

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
    // Initialize Firebase and App Check when the provider mounts
    const initializeAppCheck = async () => {
      // The key is automatically read from google-services.json on Android
      await appCheck().activate("ignored", true); 
    };

    initializeAppCheck();

    // Check for an existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    try {
      // 1. Get the App Check token from Firebase on the device
      const { token } = await appCheck().getToken(true);
      if (!token) {
        throw new Error("Could not get App Check token.");
      }

      // 2. Call our Supabase Edge Function to verify the token
      const { data, error: functionError } = await supabase.functions.invoke("verify-app-check", {
        body: { appCheckToken: token },
      });

      if (functionError || !data?.success) {
        throw functionError || new Error("Edge function verification failed.");
      }
      
      // 3. If the token is verified, sign in to Supabase anonymously
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) {
        throw signInError;
      }
      
      Toast.show({ type: "success", text1: "Verified!" });

    } catch (error) {
      console.error("Sign-in process failed:", error);
      Toast.show({ type: "error", text1: "Sign-In Failed", text2: error.message });
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

export default AuthContext;