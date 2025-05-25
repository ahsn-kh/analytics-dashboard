// src/index.ts (or src/index.js)

// Using a common way to generate UUIDs in Workers.
// Cloudflare Workers often have a built-in crypto or can use a simple UUID generator.
// For simplicity, we'll use a basic UUID v4 generation logic, or if your worker env supports it,
// you could use `crypto.randomUUID()` directly in some newer Workers environments.
// For maximum compatibility with older/simpler worker setups, we'll include a helper.

const generateUuidV4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0,
          v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Only allow POST requests (from your frontend/worker)
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Get the Supabase URL and Anon Key from environment variables
    const SUPABASE_URL = "https://ibymubpldpnzpkytkltt.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlieW11YnBsZHBuenBreXRrbHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc1ODkwNDksImV4cCI6MjA2MzE2NTA0OX0.I-6f4_I7BcTHz_LGIX3_nbU_YH43Vy8wYAR38WtWrVo";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("Supabase environment variables are not set.");
      return new Response('Server configuration error', { status: 500 });
    }

    // Initialize Supabase client (simple fetch wrapper)
    const supabaseFetch = async (path: string, options: RequestInit) => {
      const response = await fetch(`${SUPABASE_URL}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          ...options.headers,
        },
      });
      return response.json();
    };

    let response = new Response('Pageview recorded', { status: 200 }); // Default response

    // --- Handle Unique Visitor ID (Cookie Logic) ---
    const cookies = request.headers.get('Cookie');
    let visitorId: string | null = null;
    let setCookieHeader: string | null = null;

    if (cookies) {
      const visitorIdCookie = cookies.split('; ').find(row => row.startsWith('visitor_id='));
      if (visitorIdCookie) {
        visitorId = visitorIdCookie.split('=')[1];
      }
    }

    if (!visitorId) {
      // No visitor_id cookie found, generate a new one
      visitorId = generateUuidV4(); // Use the helper
      setCookieHeader = `visitor_id=${visitorId}; Max-Age=${365 * 24 * 60 * 60}; Path=/; HttpOnly; SameSite=Lax`; // Expires in 1 year
      response.headers.set('Set-Cookie', setCookieHeader); // Set the cookie in the response

      // Insert new unique visitor into Supabase
      try {
        const { data, error } = await supabaseFetch('/rest/v1/unique_visitors', {
          method: 'POST',
          body: JSON.stringify({ id: visitorId }), // Only need to provide the ID
        });

        if (error) {
          console.error('Error inserting unique visitor:', error);
        } else {
          console.log('New unique visitor inserted:', visitorId);
        }
      } catch (e) {
        console.error('Network error inserting unique visitor:', e);
      }
    } else {
      // Visitor ID cookie found, just log that we recognized them
      console.log('Returning visitor:', visitorId);
    }

    // --- Always insert a pageview ---
    try {
      const { data, error } = await supabaseFetch('/rest/v1/pageviews', {
        method: 'POST',
        body: JSON.stringify({}), // Empty body as 'created_at' defaults to now()
      });

      if (error) {
        console.error('Error inserting pageview:', error);
        response = new Response('Error recording pageview', { status: 500 });
      } else {
        console.log('Pageview recorded.');
      }
    } catch (e) {
      console.error('Network error inserting pageview:', e);
      response = new Response('Error recording pageview', { status: 500 });
    }

    // Add CORS headers to the response (critical for cross-origin fetches)
    response.headers.set('Access-Control-Allow-Origin', '*'); // Allow all origins for now
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS requests for CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: response.headers });
    }

    return response;
  },
};