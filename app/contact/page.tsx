// app/contact/page.tsx
'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { trackPageView } from '@/lib/analytics';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'; // Needed to get session

export default function ContactPage() {
  const supabase = createClientComponentClient(); // Initialize supabase client

  useEffect(() => {
    const trackDashboardPage = async () => {
      // Get the current user's session to pass their ID if logged in
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;

      // IMPORTANT: You must have a site named "My Analytics Dashboard" (or similar)
      // registered in Supabase, and its ID copied to your .env.local file.
      // e.g., NEXT_PUBLIC_ANALYTICS_DASHBOARD_SITE_ID="your_dashboard_site_uuid_here"
      const dashboardSiteId = process.env.NEXT_PUBLIC_ANALYTICS_DASHBOARD_SITE_ID || null;

      if (dashboardSiteId) {
        trackPageView(dashboardSiteId, userId); // Track with the dedicated dashboard site ID
      } else {
        console.warn("NEXT_PUBLIC_ANALYTICS_DASHBOARD_SITE_ID is not configured. Skipping tracking for dashboard /contact page.");
      }
    };
    trackDashboardPage();
  }, [supabase]); // Add supabase to dependencies to ensure it's available

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-xl w-full">
        <h1 className="text-3xl font-extrabold text-green-700 mb-4">Contact Us</h1>
        <p className="text-gray-700 mb-6">
          Feel free to reach out to us at example@example.com!
        </p>
        <Link href="/" className="text-green-500 hover:underline">
          Return to Home
        </Link>
      </div>
    </div>
  );
}