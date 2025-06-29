export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// // This is a simple CORS preflight handler.
// export function handleCors(req: Request): Response {
//  if (req.method === 'OPTIONS') {
//    return new Response('ok', { headers: corsHeaders })
//  }
//  
//  // If it's not an OPTIONS request, just return an empty response.
//  return new Response(null, { headers: corsHeaders })
//}