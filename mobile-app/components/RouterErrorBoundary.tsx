import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ColorSchemeName,
  useColorScheme,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";

import { Colors } from "../constants/Colors";

type RouterErrorBoundaryProps = {
  children: React.ReactNode;
  /**
   * Optional hook for logging captured errors to monitoring/analytics services.
   */
  onError?: (error: Error, info: React.ErrorInfo) => void;
};

type RouterErrorBoundaryLabels = {
  title: string;
  message: string;
  retry: string;
};

type RouterErrorBoundaryInnerProps = RouterErrorBoundaryProps & {
  onRetry?: () => void;
  colorScheme: ColorSchemeName | null;
  labels: RouterErrorBoundaryLabels;
};

type RouterErrorBoundaryState = {
  error: Error | null;
};

class RouterErrorBoundaryBase extends React.Component<
  RouterErrorBoundaryInnerProps,
  RouterErrorBoundaryState
> {
  state: RouterErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouterErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Always surface the error in development and allow optional custom handling.
    // eslint-disable-next-line no-console
    console.error("RouterErrorBoundary captured an error", error, info);
    this.props.onError?.(error, info);
  }

  private handleRetry = () => {
    this.setState({ error: null }, () => {
      this.props.onRetry?.();
    });
  };

  render() {
    const { error } = this.state;
    if (error) {
      const { colorScheme, labels } = this.props;
      const palette = colorScheme === "dark" ? Colors.dark : Colors.light;
      const fallbackSurface = Colors.light.surface ?? "#FFFFFF";
      const cardBackground = colorScheme === "dark" ? Colors.dark.surfaceAlt : fallbackSurface;
      return (
        <View style={[styles.container, { backgroundColor: palette.background }]}>
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <Text style={[styles.title, { color: palette.text }]}>{labels.title}</Text>
            <Text style={[styles.message, { color: palette.text }]}>{labels.message}</Text>
            {__DEV__ && (
              <Text style={[styles.details, { color: palette.text }]} accessibilityRole="text">
                {error.message}
              </Text>
            )}
            <TouchableOpacity
              onPress={this.handleRetry}
              accessibilityRole="button"
              style={[styles.retryButton, { backgroundColor: palette.tint }]}
            >
              <Text style={styles.retryButtonText}>{labels.retry}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

export function RouterErrorBoundary({ children, onError }: RouterErrorBoundaryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  const { t } = useTranslation();

  const handleRetry = React.useCallback(() => {
    if (pathname) {
      try {
        router.replace(pathname);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("RouterErrorBoundary failed to replace path", e);
      }
    } else {
      try {
        router.replace("/");
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("RouterErrorBoundary failed to replace root path", e);
      }
    }
  }, [pathname, router]);

  return (
    <RouterErrorBoundaryBase
      colorScheme={colorScheme}
      onRetry={handleRetry}
      onError={onError}
      labels={{
        title: t("router.error.title", "Something went wrong"),
        message: t(
          "router.error.message",
          "We hit a snag while loading this screen. Try again in a moment.",
        ),
        retry: t("router.error.retry", "Try again"),
      }}
    >
      {children}
    </RouterErrorBoundaryBase>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  details: {
    fontSize: 12,
    marginBottom: 16,
  },
  retryButton: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    color: "#fff",
  },
});

export default RouterErrorBoundary;
