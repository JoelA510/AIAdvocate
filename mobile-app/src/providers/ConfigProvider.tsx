import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { AppConfig, setConfig } from "../lib/config";

const ConfigContext = createContext<AppConfig | null>(null);

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context;
};

interface ConfigProviderProps {
  children: ReactNode;
}

export const ConfigProvider: React.FC<ConfigProviderProps> = ({ children }) => {
  const [config, setStateConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAndCacheConfig = async () => {
      try {
        // 1) Try cache first
        const cachedConfig = await AsyncStorage.getItem("app_config");
        if (cachedConfig) {
          const parsedConfig = JSON.parse(cachedConfig);
          setStateConfig(parsedConfig);
          setConfig(parsedConfig);
        }

        // 2) Fetch the latest from Supabase
        const { data, error } = await supabase.from("app_config").select("key, value");
        if (error) throw error;

        if (data) {
          const newConfig = data.reduce((acc: AppConfig, { key, value }) => {
            acc[key] = value;
            return acc;
          }, {} as AppConfig);

          setStateConfig(newConfig);
          setConfig(newConfig);
          await AsyncStorage.setItem("app_config", JSON.stringify(newConfig));
        }
      } catch (e) {
        console.error("Error fetching app configuration:", e);
        // Optional: surface a UI error flag here if no cache was applied
        // (we intentionally avoid referencing `config` inside this effect
        // to keep the deps array empty and avoid fetch loops)
      } finally {
        setLoading(false);
      }
    };

    fetchAndCacheConfig();
  }, []); // mounted once; no external values read inside

  if (loading && !config) {
    // Render nothing or a spinner while fetching the initial config
    return null;
  }

  if (!config) {
    // If still no config after loading, you could return an error screen instead.
    return null;
  }

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
};
