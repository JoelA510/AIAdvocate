// supabase/functions/_shared/cors.ts

/**
 * CORS Configuration
 * 
 * Supports both:
 * - Mobile apps (iOS/Android): Requires wildcard due to varying app schemes
 * - Web app: https://www.ai-advocate.org
 * 
 * Note: We use wildcard (*) because React Native mobile apps use custom schemes
 * that change per build/environment. For web-only APIs, restrict to specific domain.
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Required for mobile apps
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};