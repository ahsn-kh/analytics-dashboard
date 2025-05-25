// lib/analytics.ts
import { supabase } from '@/lib/supabase';

export async function trackPageView() {
  // Ensure this code only runs in the browser environment
  if (typeof window === 'undefined') {
    console.log("Skipping page view tracking on server side.");
    return;
  }

  console.log("Attempting to track page view...");

  // Get or create a unique visitor ID
  let visitorId = localStorage.getItem('visitor_id');
  let isNewVisitor = false;

  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem('visitor_id', visitorId);
    isNewVisitor = true;
  }

  // Get the current page path
  const currentPath = window.location.pathname;

  // Get referrer (if available). document.referrer is empty string for direct navigation.
  const referrer = document.referrer || null;

  // Get User-Agent string (browser and OS info)
  const userAgent = navigator.userAgent || null;

  // 1. Insert into pageviews table
  const { data: pageviewData, error: pageviewError } = await supabase
    .from('pageviews')
    .insert({
      site_id: 'my-portfolio-site', // Make sure this matches your chosen site_id in Supabase
      ts: new Date().toISOString(), // Use current timestamp
      ref: referrer,       // Now storing the actual referrer
      path: currentPath,
      user_id: visitorId,  // Link pageview to the visitor ID
      user_agent: userAgent // Store the user agent string
    });

  if (pageviewError) {
    console.error("Error inserting pageview:", pageviewError.message);
  } else {
    console.log("Pageview inserted successfully:", pageviewData);
  }

  // 2. Insert into unique_visitors table ONLY if it's a new visitor
  if (isNewVisitor) {
    const { data: uniqueData, error: uniqueError } = await supabase
      .from('unique_visitors')
      .insert({
        id: visitorId, // This should match the column name for the unique visitor ID in your unique_visitors table
        created_at: new Date().toISOString(),
        // You might want to add more visitor specific info here later, like user_agent, etc.
        // For simplicity, we are keeping it basic as per your existing structure.
      });

    if (uniqueError) {
      console.error("Error inserting unique visitor:", uniqueError.message);
    } else {
      console.log("Unique visitor inserted successfully:", uniqueData);
    }
  }
}