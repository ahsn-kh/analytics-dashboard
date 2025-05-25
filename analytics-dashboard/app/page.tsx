// app/page.tsx
"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { trackPageView } from '@/lib/analytics';
import Link from 'next/link';

// NEW IMPORTS FOR CHARTS
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register Chart.js components globally
// This is necessary for Chart.js to render correctly
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Define a type for your top pages data
interface TopPage {
  path: string;
  count: number;
}

// NEW INTERFACE: For Daily Pageview data
interface DailyPageView {
  date_trunc_day: string; // Supabase returns date as string (e.g., "YYYY-MM-DD")
  count: number;
}

// NEW INTERFACES: For Top Referrers and User Agents
interface TopReferrer {
  referrer: string;
  count: number;
}

interface TopUserAgent {
  user_agent: string;
  count: number;
}


export default function Home() {
  const [totalVisits, setTotalVisits] = useState<number>(0);
  const [visitsToday, setVisitsToday] = useState<number>(0);
  const [visits24Hours, setVisits24Hours] = useState<number>(0);
  const [visits7Days, setVisits7Days] = useState<number>(0);
  const [visits30Days, setVisits30Days] = useState<number>(0);
  const [uniqueVisitors, setUniqueVisitors] = useState<number>(0);
  const [topPages, setTopPages] = useState<TopPage[]>([]);

  // NEW STATE: For Date Range Filtering
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  // NEW STATE: For Chart Data
  const [dailyPageviews, setDailyPageviews] = useState<DailyPageView[]>([]);
  // NEW STATES: For Top Referrers and User Agents
  const [topReferrers, setTopReferrers] = useState<TopReferrer[]>([]);
  const [topUserAgents, setTopUserAgents] = useState<TopUserAgent[]>([]);

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

  // --- Function to fetch all counts based on current filters ---
  const fetchCounts = async () => {
    // Convert state dates to Supabase format if they exist
    // 'T00:00:00Z' for start of day, 'T23:59:59Z' for end of day, assuming UTC for the database
    const startDateTime = startDate ? new Date(startDate + 'T00:00:00Z') : null;
    const endDateTime = endDate ? new Date(endDate + 'T23:59:59Z') : null;

    const formattedStartDate = startDateTime ? formatSupabaseDateTime(startDateTime) : null;
    const formattedEndDate = endDateTime ? formatSupabaseDateTime(endDateTime) : null;

    // --- Fetch Total Visits (now filtered by date range if provided) ---
    let totalVisitsQuery = supabase
      .from('pageviews')
      .select('*', { count: 'exact', head: true });

    if (formattedStartDate) {
      totalVisitsQuery = totalVisitsQuery.gte('ts', formattedStartDate);
    }
    if (formattedEndDate) {
      totalVisitsQuery = totalVisitsQuery.lte('ts', formattedEndDate);
    }
    const { count: totalCount, error: totalError } = await totalVisitsQuery;

    if (totalError) {
      console.error("Error fetching total pageview count:", totalError.message);
    } else {
      setTotalVisits(totalCount ?? 0);
    }

    // --- Fetch Unique Visitors (now filtered by date range if provided) ---
    let uniqueVisitorsQuery = supabase
      .from('unique_visitors')
      .select('*', { count: 'exact', head: true });

    if (formattedStartDate) {
      // Assuming 'created_at' for unique_visitors table
      uniqueVisitorsQuery = uniqueVisitorsQuery.gte('created_at', formattedStartDate);
    }
    if (formattedEndDate) {
      uniqueVisitorsQuery = uniqueVisitorsQuery.lte('created_at', formattedEndDate);
    }
    const { count: uniqueVisitorsCount, error: uniqueVisitorsError } = await uniqueVisitorsQuery;

    if (uniqueVisitorsError) {
      console.error("Error fetching unique visitors count:", uniqueVisitorsError.message);
    } else {
      setUniqueVisitors(uniqueVisitorsCount ?? 0);
    }

    // --- Conditional Fetches for "Today", "Last 24 Hours", "Last 7 Days", "Last 30 Days" ---
    // These will only fetch if NO custom date range is applied
    if (!formattedStartDate && !formattedEndDate) {
      // Visits Today
      const { count: todayCount, error: todayError } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact', head: true })
        .gte('ts', getStartOfTodayUtc());

      if (todayError) {
        console.error("Error fetching initial visits today count:", todayError.message);
      } else {
        setVisitsToday(todayCount ?? 0);
      }

      // Last 24 Hours
      const { count: twentyFourHoursCount, error: twentyFourHoursError } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact', head: true })
        .gte('ts', get24HoursAgoUtc());

      if (twentyFourHoursError) {
        console.error("Error fetching initial visits last 24 hours count:", twentyFourHoursError.message);
      } else {
        setVisits24Hours(twentyFourHoursCount ?? 0);
      }

      // Last 7 Days
      const { count: sevenDaysCount, error: sevenDaysError } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact', head: true })
        .gte('ts', get7DaysAgoUtc());

      if (sevenDaysError) {
        console.error("Error fetching initial visits last 7 days count:", sevenDaysError.message);
      } else {
        setVisits7Days(sevenDaysCount ?? 0);
      }

      // Last 30 Days
      const { count: thirtyDaysCount, error: thirtyDaysError } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact', head: true })
        .gte('ts', get30DaysAgoUtc());

      if (thirtyDaysError) {
        console.error("Error fetching initial visits last 30 days count:", thirtyDaysError.message);
      } else {
        setVisits30Days(thirtyDaysCount ?? 0);
      }
    } else {
      // If a custom date range is applied, clear these specific counts as they are not relevant
      setVisitsToday(0);
      setVisits24Hours(0);
      setVisits7Days(0);
      setVisits30Days(0);
    }

    // --- Fetch Top Pages using RPC Function with date parameters ---
    const { data: topPagesData, error: topPagesError } = await supabase
      .rpc('get_top_pages', {
        start_date: formattedStartDate,
        end_date: formattedEndDate
      });

    if (topPagesError) {
      console.error("Error fetching top pages:", topPagesError.message);
    } else {
      setTopPages(topPagesData as TopPage[] || []);
    }

    // --- Fetch Daily Pageviews for Chart ---
    const { data: dailyPageviewsData, error: dailyPageviewsError } = await supabase
      .rpc('get_daily_pageviews', {
        start_date: formattedStartDate,
        end_date: formattedEndDate
      });

    if (dailyPageviewsError) {
      console.error("Error fetching daily pageviews:", dailyPageviewsError.message);
    } else {
      setDailyPageviews(dailyPageviewsData as DailyPageView[] || []);
    }

    // --- NEW: Fetch Top Referrers ---
    const { data: topReferrersData, error: topReferrersError } = await supabase
      .rpc('get_top_referrers', {
        start_date: formattedStartDate,
        end_date: formattedEndDate
      });

    if (topReferrersError) {
      console.error("Error fetching top referrers:", topReferrersError.message);
    } else {
      setTopReferrers(topReferrersData as TopReferrer[] || []);
    }

    // --- NEW: Fetch Top User Agents ---
    const { data: topUserAgentsData, error: topUserAgentsError } = await supabase
      .rpc('get_top_user_agents', {
        start_date: formattedStartDate,
        end_date: formattedEndDate
      });

    if (topUserAgentsError) {
      console.error("Error fetching top user agents:", topUserAgentsError.message);
    } else {
      setTopUserAgents(topUserAgentsData as TopUserAgent[] || []);
    }
  };

  useEffect(() => {
    trackPageView();

    // Initial fetch of counts
    // Small delay to allow initial pageview tracking to potentially complete
    const timer = setTimeout(() => {
      fetchCounts();
    }, 100);

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
          // When a new pageview comes in, we want to update the overall counts
          // and potentially the top pages. The simplest way is to re-fetch all.
          // Also, clear any active date filters so real-time updates always reflect global data.
          setStartDate('');
          setEndDate('');
          setTimeout(() => fetchCounts(), 0); // Re-fetch all counts after state update
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
          // Simple increment for unique visitors. fetchCounts will update uniqueVisitors fully.
          setUniqueVisitors((prevUnique) => prevUnique + 1);
          // No need to re-fetch all here, as the pageviews channel update handles global refresh.
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up channel subscriptions.');
      clearTimeout(timer);
      supabase.removeChannel(pageviewsChannel);
      supabase.removeChannel(uniqueVisitorsChannel);
    };
  }, []); // Empty dependency array means this useEffect runs once on mount and cleanup on unmount


  // Prepare Chart Data and Options
  const chartData = {
    labels: dailyPageviews.map(data => data.date_trunc_day), // X-axis labels (dates)
    datasets: [
      {
        label: 'Daily Pageviews',
        data: dailyPageviews.map(data => data.count), // Y-axis values (counts)
        fill: true,
        backgroundColor: 'rgba(75,192,192,0.2)',
        borderColor: 'rgba(75,192,192,1)',
        tension: 0.1, // Smooths the line
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false, // Allows you to set a custom height/width via CSS
    plugins: {
      legend: {
        position: 'top' as const, // Positions the legend at the top
      },
      title: {
        display: true,
        text: 'Daily Pageviews Trend', // Chart title
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Date',
        },
      },
      y: {
        beginAtZero: true, // Ensures the Y-axis starts at 0
        title: {
          display: true,
          text: 'Pageviews',
        },
      },
    },
  };

  // --- UI Rendering ---
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-6xl w-full">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-700 mb-6">
          Website Analytics
        </h1>

        {/* --- Navigation Links Section --- */}
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

        {/* --- Date Range Filter Section --- */}
        <div className="mt-8 mb-10 p-6 bg-gray-50 rounded-lg border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Filter by Date Range:</h2>
          <div className="flex flex-wrap justify-center items-end gap-4">
            <div className="flex flex-col">
              <label htmlFor="startDate" className="text-sm font-medium text-gray-700 mb-1 text-left">Start Date:</label>
              <input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex flex-col">
              <label htmlFor="endDate" className="text-sm font-medium text-gray-700 mb-1 text-left">End Date:</label>
              <input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={fetchCounts} // Call the fetchCounts function
              className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors duration-200 self-end"
            >
              Apply Filter
            </button>
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                // Use setTimeout to allow state to update before fetching
                setTimeout(() => fetchCounts(), 0);
              }}
              className="px-6 py-3 bg-gray-400 text-white rounded-md hover:bg-gray-500 transition-colors duration-200 self-end"
            >
              Clear Filter
            </button>
          </div>
        </div>
        {/* --- End Date Range Filter Section --- */}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6 gap-6">
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

          {/* These will show 0 or N/A when a custom filter is applied */}
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

        {/* --- Section for Top Pages --- */}
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

        {/* --- NEW: Section for Top Referrers --- */}
        <div className="mt-10 bg-white p-8 rounded-lg shadow-xl text-center max-w-2xl w-full mx-auto border border-gray-200">
          <h2 className="text-2xl font-extrabold text-gray-800 mb-4">Top Referrers</h2>
          {topReferrers.length > 0 ? (
            <ul className="text-left space-y-2">
              {topReferrers.map((data, index) => (
                <li key={index} className="flex justify-between items-center text-lg text-gray-700">
                  <span className="font-medium truncate">{data.referrer}</span>
                  <span className="font-bold text-gray-900">{data.count} visits</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No referrer data available yet.</p>
          )}
        </div>

        {/* --- NEW: Section for Top Browsers/OS (User Agents) --- */}
        <div className="mt-10 bg-white p-8 rounded-lg shadow-xl text-center max-w-2xl w-full mx-auto border border-gray-200">
          <h2 className="text-2xl font-extrabold text-gray-800 mb-4">Top User Agents</h2>
          {topUserAgents.length > 0 ? (
            <ul className="text-left space-y-2">
              {topUserAgents.map((data, index) => (
                <li key={index} className="flex justify-between items-center text-lg text-gray-700">
                  {/* You might want to parse user_agent for cleaner display here */}
                  <span className="font-medium truncate">{data.user_agent}</span>
                  <span className="font-bold text-gray-900">{data.count} visits</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No user agent data available yet.</p>
          )}
        </div>

        {/* --- Section for Daily Pageviews Chart --- */}
        <div className="mt-10 bg-white p-8 rounded-lg shadow-xl max-w-6xl w-full mx-auto border border-gray-200">
          <h2 className="text-2xl font-extrabold text-gray-800 mb-4">Daily Pageviews</h2>
          {/* Set a height for the chart container so it renders properly */}
          <div style={{ height: '400px', width: '100%' }}>
            {dailyPageviews.length > 0 ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <p className="text-gray-500">No daily pageview data available for this range.</p>
            )}
          </div>
        </div>
        {/* --- End Daily Pageviews Chart Section --- */}

        <p className="mt-8 text-sm text-gray-500">
          (Counts update in real-time when new visits are recorded!)
        </p>
      </div>
    </div>
  );
}