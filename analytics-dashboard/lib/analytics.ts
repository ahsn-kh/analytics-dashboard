// lib/analytics.ts
import { supabase } from '@/lib/supabase';

export async function trackPageView() {
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
  const currentPath = window.location.pathname; // This gets '/about', '/', '/blog/post-name', etc.

  // 1. Insert into pageviews table
  const { data: pageviewData, error: pageviewError } = await supabase
    .from('pageviews')
    .insert({
      site_id: 'my-portfolio-site', // Make sure this matches your chosen site_id
      ts: new Date().toISOString(),
      ref: document.referrer || null,
      path: currentPath, // <--- ADD THIS LINE
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
        id: visitorId,
        created_at: new Date().toISOString(),
      });

    if (uniqueError) {
      console.error("Error inserting unique visitor:", uniqueError.message);
    } else {
      console.log("Unique visitor inserted successfully:", uniqueData);
    }
  }
}