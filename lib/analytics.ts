// lib/analytics.ts

// We no longer need @supabase/auth-helpers-nextjs or uuid here,
// as the Cloudflare Worker will handle the Supabase insertion,
// IP address collection/hashing, and visitor ID cookie management.
// import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'; // REMOVE THIS LINE
// import { v4 as uuidv4 } from 'uuid'; // REMOVE THIS LINE

// Define the Cloudflare Worker URL from environment variables.
// This variable MUST be set in your Next.js project's .env.local file
// (e.g., NEXT_PUBLIC_CLOUDFLARE_WORKER_URL=https://your-worker-name.your-username.workers.dev)
const CLOUDFLARE_WORKER_URL = process.env.NEXT_PUBLIC_CLOUDFLARE_WORKER_URL;

/**
 * Tracks a pageview by sending data to the Cloudflare Worker.
 * The Worker will handle IP address collection, hashing, and Supabase insertion.
 *
 * @param siteId The ID of the site being tracked (from your Supabase 'sites' table).
 * @param userId Optional: The ID of the logged-in user, if applicable.
 */
export async function trackPageView(siteId: string, userId: string | null = null) {
    // Basic validation for the worker URL
    if (!CLOUDFLARE_WORKER_URL) {
        console.error("NEXT_PUBLIC_CLOUDFLARE_WORKER_URL is not set in your Next.js environment variables.");
        return; // Stop execution if worker URL is missing
    }

    // Collect all relevant pageview data from the browser's window and document objects.
    const currentPath = window.location.pathname;
    const referrer = document.referrer || null; // The URL of the page that linked to the current page
    const userAgent = navigator.userAgent || null; // Full user agent string
    const browserLanguage = navigator.language || null; // e.g., "en-US"
    const screenResolution = `${window.screen.width}x${window.screen.height}`; // e.g., "1920x1080"
    const viewportWidth = window.innerWidth; // Current width of the browser viewport
    const viewportHeight = window.innerHeight; // Current height of the browser viewport

    // Prepare the data payload to send to your Cloudflare Worker.
    // The Worker will then process this data, add the IP address (hashed),
    // manage the visitor_id cookie, and insert into Supabase.
    const pageviewData = {
        site_id: siteId,
        path: currentPath,
        referrer: referrer,
        user_agent: userAgent,
        browser_language: browserLanguage,
        screen_resolution: screenResolution,
        viewport_width: viewportWidth,
        viewport_height: viewportHeight,
        user_id: userId, // Pass the user ID if available (e.g., from Supabase session)
    };

    try {
        // Send a POST request to your Cloudflare Worker.
        // credentials: 'include' is crucial here. It ensures that any cookies
        // (like the 'visitor_id' cookie set by your Worker) are sent with the request.
        // This allows your Worker to read the existing visitor_id or set a new one.
        const response = await fetch(`${CLOUDFLARE_WORKER_URL}/track`, { // <-- CORRECTED LINE
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // No need for Supabase API key here, the Worker handles it.
            },
            body: JSON.stringify(pageviewData),
            credentials: 'include', // Ensures cookies are sent/received
        });

        // Check if the request to the Worker was successful (HTTP status 2xx)
        if (!response.ok) {
            const errorText = await response.text();
            console.error(
                `Failed to record pageview via Cloudflare Worker. Status: ${response.status}. Error: ${errorText}`
            );
        } else {
            console.log("Pageview successfully sent to Cloudflare Worker.");
            // The Worker handles the visitor_id cookie (HttpOnly), so no client-side localStorage needed.
        }
    } catch (error: any) {
        // Catch any network errors or issues preventing the fetch call itself
        console.error("Network error when sending pageview to Cloudflare Worker:", error.message || error);
    }
}