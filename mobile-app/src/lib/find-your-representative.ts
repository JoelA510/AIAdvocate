// mobile-app/src/lib/find-your-representative.ts

import { supabase } from "./supabase";

export const LOOKUP_UNAVAILABLE_MESSAGE =
  "Representative lookup is temporarily unavailable. Please try again later.";

type FunctionResponse =
  | {
      results?: any[];
      error?: string;
    }
  | any[];

/**
 * Fetch nearby state legislators for a user-supplied address.
 * Calls the Supabase Edge Function so provider credentials stay server-side.
 */
export async function findYourRep(address: string): Promise<any[]> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error("Please enter a location.");
  }

  try {
    return await invokeEdgeFunction(trimmed);
  } catch {
    throw new Error(LOOKUP_UNAVAILABLE_MESSAGE);
  }
}

async function invokeEdgeFunction(query: string): Promise<any[]> {
  const { data, error } = await supabase.functions.invoke<FunctionResponse>("find-your-rep", {
    body: { query },
  });

  if (error) {
    throw new Error(LOOKUP_UNAVAILABLE_MESSAGE);
  }

  if (Array.isArray(data)) return data;

  if (data?.error) {
    throw new Error(LOOKUP_UNAVAILABLE_MESSAGE);
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  throw new Error(LOOKUP_UNAVAILABLE_MESSAGE);
}
