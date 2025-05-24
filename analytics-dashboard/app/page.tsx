// app/page.tsx
"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [totalVisits, setTotalVisits] = useState<number>(0); // Renamed for clarity
  const [visitsToday, setVisitsToday] = useState<number>(0); // NEW STATE FOR VISITS TODAY

  useEffect(() => {
    // Helper function to get the start of today in ISO format
    const getStartOfTodayISO = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to the beginning of the day (local time)
      return today.toISOString(); // Convert to ISO string for Supabase query
    };

    const fetchInitialCounts = async () => {
      // Fetch initial total count
      const { count: totalCount, error: totalError } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact', head: true });

      if (totalError) {
        console.error("Error fetching initial total pageview count:", totalError.message);
      } else {
        setTotalVisits(totalCount ?? 0);
      }

      // Fetch initial visits today count
      const { count: todayCount, error: todayError } = await supabase
        .from('pageviews')
        .select('*', {
          count: 'exact',
          head: true
        })
        .gte('created_at', getStartOfTodayISO()); // Filter for records created today

      if (todayError) {
        console.error("Error fetching initial visits today count:", todayError.message);
      } else {
        setVisitsToday(todayCount ?? 0);
      }
    };

    fetchInitialCounts();

    // --- Supabase Realtime Subscription ---
    // Ensure no previous channels with this name are active before subscribing
    const existingChannels = supabase.getChannels();
    for (const ch of existingChannels) {
      if (ch.topic === 'realtime:pageviews_channel') {
        supabase.removeChannel(ch);
        console.log('Removed existing channel:', ch.topic);
      }
    }

    const channel = supabase
      .channel('pageviews_channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pageviews' },
        (payload) => {
          console.log('New pageview inserted:', payload);
          setTotalVisits((prevTotal) => prevTotal + 1); // Increment total

          // Check if the inserted pageview is from today
          const insertedDate = new Date(payload.new.created_at); // Assuming 'created_at' is in payload.new
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);

          if (insertedDate >= startOfToday) {
            setVisitsToday((prevToday) => prevToday + 1); // Increment visits today
          }
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      console.log('Cleaning up channel subscription.');
      supabase.removeChannel(channel);
    };
  }, []); // Empty dependency array

  // --- UI Rendering ---
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-sm w-full">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-700 mb-6"> {/* Increased margin */}
          Website Analytics
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6"> {/* Grid for multiple metrics */}
          {/* Card for Total Website Visits */}
          <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
            <h2 className="text-xl font-semibold text-blue-800 mb-2">Total Visits</h2>
            <p className="text-5xl font-bold text-blue-900 leading-none">
              {totalVisits}
            </p>
          </div>

          {/* Card for Visits Today */}
          <div className="bg-green-50 p-6 rounded-lg border border-green-200">
            <h2 className="text-xl font-semibold text-green-800 mb-2">Visits Today</h2>
            <p className="text-5xl font-bold text-green-900 leading-none">
              {visitsToday}
            </p>
          </div>
        </div>

        <p className="mt-8 text-sm text-gray-500">
          (Counts update in real-time when new visits are recorded!)
        </p>
      </div>
    </div>
  );
}