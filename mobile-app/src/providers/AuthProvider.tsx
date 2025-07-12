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
  isReady: boolean;
  signIn: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        if (firebase.apps.length === 0) {
          await firebase.initializeApp(Platform.OS === 'web' ? firebaseConfig : undefined);
        }
        
        // --- THIS IS THE KEY CHANGE ---
        // Only activate App Check on native platforms
        if (Platform.OS !== 'web') {
          console.log("Activating App Check for native...");
          await appCheck().activate("ignored", true);
          console.log("App Check activated.");
        } else {
          console.log("Skipping App Check activation for web.");
        }
        
        // If we reach here without errors, we are ready.
        setIsReady(true);

      } catch (e) {
        console.error("Initialization failed:", e);
        Toast.show({ type: 'error', text1: 'Initialization Failed', text2: e.message });
      }

      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
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
      // For native, we get and verify the App Check token
      if (Platform.OS !== 'web') {
        const { token } = await appCheck().getToken(true);
        if (!token) throw new Error("Could not get App Check token.");

        const { data, error: functionError } = await supabase.functions.invoke("verify-app-check", {
          body: { appCheckToken: token },
        });
        if (functionError || !data?.success) throw functionError || new Error("Edge function verification failed.");
      }
      
      // If verification succeeds (or is skipped for web), sign in.
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
export default AuthProvider;
export { AuthContext };

// This code is part of a React Native application that provides authentication functionality using Supabase and Firebase App Check. It initializes the Firebase app, activates App Check for native platforms, and manages user sessions with Supabase. The `AuthProvider` component wraps the application to provide authentication context, while the `useAuth` hook allows components to access authentication state and methods. The code also includes error handling and user feedback via Toast notifications.
// The `signIn` method handles the sign-in process, including App Check token verification for native platforms, and provides feedback on success or failure. The context is designed to be used throughout the application, ensuring that authentication state is easily accessible in any component that needs it.