// mobile-app/src/test-utils/query.tsx
//
// Screens and cards that read Supabase now do so through React Query, so any
// test that renders one needs a QueryClient in scope or the hook throws
// "No QueryClient set". This is the shared harness for that.
//
// Retries are off deliberately: the default exponential-backoff retry turns a
// deliberately-failing mock into a multi-second test with pending timers at
// teardown, which is how "Jest did not exit" warnings start.

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function QueryWrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(createTestQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
