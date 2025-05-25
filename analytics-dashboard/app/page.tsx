// app/page.tsx
"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { trackPageView } from '@/lib/analytics';
import Link from 'next/link'; // NEW IMPORT: Import Link component for navigation

// Define a type for your top pages data
interface TopPage {
  path: string;
  count: number;
}

export default function Home() {
  const [totalVisits, setTotalVisits] = useState<number>(0);
  const [visitsToday, setVisitsToday] = useState<number>(0);
  const [visits24Hours, setVisits24Hours] = useState<number>(0);
  const [visits7Days, setVisits7Days] = useState<number>(0);
  const [visits30Days, setVisits30Days] = useState<number>(0);
  const [uniqueVisitors, setUniqueVisitors] = useState<number>(0);
  const [topPages, setTopPages] = useState<TopPage[]>([]); // NEW STATE FOR TOP PAGES

  // --- Helper functions to get date/time strings in ISOString and UTC for Supabase ---
  const formatSupabaseDateTime = (date: Date) => {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}+00`; // Use +00 for UTC explicit offset
  };

  const getStartOfTodayUtc = () => {
    const now = new Date();
    const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    return formatSupabaseDateTime(startOfTodayUtc);
  };

  const get24HoursAgoUtc = () => {
    const now = new Date();
    const date24HoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    return formatSupabaseDateTime(date24HoursAgo);
  };

  const get7DaysAgoUtc = () => {
    const now = new Date();
    const date7DaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    return formatSupabaseDateTime(date7DaysAgo);
  };

  const get30DaysAgoUtc = () => {
    const now = new Date();
    const date30DaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    return formatSupabaseDateTime(date30DaysAgo);
  };

  useEffect(() => {
    trackPageView();

    const timer = setTimeout(() => {
      fetchInitialCounts();
    }, 100); // 100ms delay

    const fetchInitialCounts = async () => {
      // --- Existing fetches for total and time-based counts ---
      const { count: totalCount, error: totalError } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact', head: true });

      if (totalError) {
        console.error("Error fetching initial total pageview count:", totalError.message);
      } else {
        setTotalVisits(totalCount ?? 0);
      }

      const { count: todayCount, error: todayError } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact', head: true })
        .gte('ts', getStartOfTodayUtc());

      if (todayError) {
        console.error("Error fetching initial visits today count:", todayError.message);
      } else {
        setVisitsToday(todayCount ?? 0);
      }

      const { count: twentyFourHoursCount, error: twentyFourHoursError } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact', head: true })
        .gte('ts', get24HoursAgoUtc());

      if (twentyFourHoursError) {
        console.error("Error fetching initial visits last 24 hours count:", twentyFourHoursError.message);
      } else {
        setVisits24Hours(twentyFourHoursCount ?? 0);
      }

      const { count: sevenDaysCount, error: sevenDaysError } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact', head: true })
        .gte('ts', get7DaysAgoUtc());

      if (sevenDaysError) {
        console.error("Error fetching initial visits last 7 days count:", sevenDaysError.message);
      } else {
        setVisits7Days(sevenDaysCount ?? 0);
      }

      const { count: thirtyDaysCount, error: thirtyDaysError } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact', head: true })
        .gte('ts', get30DaysAgoUtc());

      if (thirtyDaysError) {
        console.error("Error fetching initial visits last 30 days count:", thirtyDaysError.message);
      } else {
        setVisits30Days(thirtyDaysCount ?? 0);
      }

      const { count: uniqueVisitorsCount, error: uniqueVisitorsError } = await supabase
        .from('unique_visitors')
        .select('*', { count: 'exact', head: true });

      if (uniqueVisitorsError) {
        console.error("Error fetching initial unique visitors count:", uniqueVisitorsError.message);
      } else {
        setUniqueVisitors(uniqueVisitorsCount ?? 0);
      }

      // --- NEW: Fetch Top Pages using RPC Function ---
      const { data: topPagesData, error: topPagesError } = await supabase
        .rpc('get_top_pages'); // Call the database function

      if (topPagesError) {
        console.error("Error fetching top pages:", topPagesError.message);
      } else {
        // The data returned by RPC will match the TABLE() definition in the function
        setTopPages(topPagesData as TopPage[] || []);
      }
    };

    // --- Existing Realtime Subscriptions ---
    const existingChannels = supabase.getChannels();
    for (const ch of existingChannels) {
      if (ch.topic === 'realtime:pageviews_channel' || ch.topic === 'realtime:unique_visitors_channel') {
        supabase.removeChannel(ch);
        console.log('Removed existing channel:', ch.topic);
      }
    }

    const pageviewsChannel = supabase
      .channel('pageviews_channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pageviews' },
        (payload) => {
          console.log('New pageview inserted:', payload);
          setTotalVisits((prevTotal) => prevTotal + 1);

          const insertedDate = new Date(payload.new.ts);
          
          const startOfToday = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 0, 0, 0, 0));
          if (insertedDate >= startOfToday) {
            setVisitsToday((prevToday) => prevToday + 1);
          }

          const twentyFourHoursAgo = new Date(new Date().getTime() - (24 * 60 * 60 * 1000));
          if (insertedDate >= twentyFourHoursAgo) {
            setVisits24Hours((prev24Hours) => prev24Hours + 1);
          }

          const sevenDaysAgo = new Date(new Date().getTime() - (7 * 24 * 60 * 60 * 1000));
          if (insertedDate >= sevenDaysAgo) {
            setVisits7Days((prev7Days) => prev7Days + 1);
          }

          const thirtyDaysAgo = new Date(new Date().getTime() - (30 * 24 * 60 * 60 * 1000));
          if (insertedDate >= thirtyDaysAgo) {
            setVisits30Days((prev30Days) => prev30Days + 1);
          }

          // Trigger a re-fetch of top pages on new insert for real-time update
          // This will re-fetch all counts, including top pages (via RPC)
          fetchInitialCounts();
        }
      )
      .subscribe();

    const uniqueVisitorsChannel = supabase
      .channel('unique_visitors_channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'unique_visitors' },
        (payload) => {
          console.log('New unique visitor inserted:', payload);
          setUniqueVisitors((prevUnique) => prevUnique + 1);
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up channel subscriptions.');
      clearTimeout(timer);
      supabase.removeChannel(pageviewsChannel);
      supabase.removeChannel(uniqueVisitorsChannel);
    };
  }, []);

  // --- UI Rendering ---
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-6xl w-full">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-700 mb-6">
          Website Analytics
        </h1>

        {/* --- NEW: Navigation Links Section --- */}
        <div className="mt-8 mb-10 p-6 bg-gray-50 rounded-lg border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Explore Pages:</h2>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/" className="px-6 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-200">
              Home
            </Link>
            <Link href="/about" className="px-6 py-3 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-200">
              About Us
            </Link>
            <Link href="/contact" className="px-6 py-3 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors duration-200">
              Contact Us
            </Link>
            {/* Add more links here for any other pages you create */}
          </div>
        </div>
        {/* --- End Navigation Links Section --- */}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6 gap-6">
          {/* ... Existing cards for total, unique, today, 24h, 7d, 30d visits ... */}
          <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
            <h2 className="text-xl font-semibold text-blue-800 mb-2">Total Visits</h2>
            <p className="text-5xl font-bold text-blue-900 leading-none">
              {totalVisits}
            </p>
          </div>

          <div className="bg-cyan-50 p-6 rounded-lg border border-cyan-200">
            <h2 className="text-xl font-semibold text-cyan-800 mb-2">Unique Visitors</h2>
            <p className="text-5xl font-bold text-cyan-900 leading-none">
              {uniqueVisitors}
            </p>
          </div>

          <div className="bg-green-50 p-6 rounded-lg border border-green-200">
            <h2 className="text-xl font-semibold text-green-800 mb-2">Visits Today</h2>
            <p className="text-5xl font-bold text-green-900 leading-none">
              {visitsToday}
            </p>
          </div>

          <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
            <h2 className="text-xl font-semibold text-purple-800 mb-2">Last 24 Hours</h2>
            <p className="text-5xl font-bold text-purple-900 leading-none">
              {visits24Hours}
            </p>
          </div>

          <div className="bg-orange-50 p-6 rounded-lg border border-orange-200">
            <h2 className="text-xl font-semibold text-orange-800 mb-2">Last 7 Days</h2>
            <p className="text-5xl font-bold text-orange-900 leading-none">
              {visits7Days}
            </p>
          </div>

          <div className="bg-red-50 p-6 rounded-lg border border-red-200">
            <h2 className="text-xl font-semibold text-red-800 mb-2">Last 30 Days</h2>
            <p className="text-5xl font-bold text-red-900 leading-none">
              {visits30Days}
            </p>
          </div>
        </div>

        {/* --- NEW: Section for Top Pages --- */}
        <div className="mt-10 bg-white p-8 rounded-lg shadow-xl text-center max-w-2xl w-full mx-auto border border-gray-200">
          <h2 className="text-2xl font-extrabold text-gray-800 mb-4">Top Pages Visited</h2>
          {topPages.length > 0 ? (
            <ul className="text-left space-y-2">
              {topPages.map((page, index) => (
                <li key={index} className="flex justify-between items-center text-lg text-gray-700">
                  <span className="font-medium truncate">{page.path === '/' ? '(Homepage)' : page.path}</span>
                  <span className="font-bold text-gray-900">{page.count} visits</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No page data available yet or being loaded...</p>
          )}
        </div>

        <p className="mt-8 text-sm text-gray-500">
          (Counts update in real-time when new visits are recorded!)
        </p>
      </div>
    </div>
  );
}
