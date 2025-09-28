import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { AppConfig, initConfig, setConfig } from "../lib/config";

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
  const baseConfig = useMemo(() => initConfig(), []);
  const [config, setStateConfig] = useState<AppConfig>(baseConfig);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchAndCacheConfig = async () => {
      try {
        const cachedConfig = await AsyncStorage.getItem("app_config");
        if (cachedConfig) {
          try {
            const parsedConfig = JSON.parse(cachedConfig) as Partial<AppConfig>;
            if (!cancelled) {
              const merged = { ...baseConfig, ...parsedConfig } as AppConfig;
              setStateConfig(merged);
              setConfig(merged);
            }
          } catch (parseErr) {
            console.warn("ConfigProvider: Failed to parse cached config", parseErr);
          }
        }

        const { data, error } = await supabase.from("app_config").select("key, value");
        if (error) throw error;

        if (data && data.length && !cancelled) {
          const overrides = data.reduce<Partial<AppConfig>>((acc, { key, value }) => {
            (acc as Record<string, string | undefined>)[key] = value;
            return acc;
          }, {});

          const merged = { ...baseConfig, ...overrides } as AppConfig;
          setStateConfig(merged);
          setConfig(merged);
          await AsyncStorage.setItem("app_config", JSON.stringify(merged));
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Error fetching app configuration:", e);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchAndCacheConfig();
    return () => {
      cancelled = true;
    };
  }, [baseConfig]);

  if (loading && !config) {
    return null;
  }

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
};
