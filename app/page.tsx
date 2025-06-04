// app/page.tsx
'use client'; // This is important for client-side functionality

import { useState, useEffect, useMemo, useCallback } from 'react'; // Added useCallback
import { trackPageView } from '@/lib/analytics'; // Assuming this tracks the dashboard's own pageview
import Link from 'next/link';

// NEW IMPORTS FOR AUTHENTICATION
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Session } from '@supabase/supabase-js';

// NEW IMPORT: for User Agent Parsing
import { UAParser } from 'ua-parser-js';
// NEW IMPORTS FOR CHARTS
import { Line } from 'react-chartjs-2'; // Make sure you have this import if using react-chartjs-2
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Define types for your data structures
interface TopPage {
  path: string;
  count: number;
}

interface DailyPageView {
  day: string;
  views: number;
}

interface TopReferrer {
  referrer: string;
  count: number;
}

interface TopUserAgent {
  user_agent: string;
  count: number;
  parsed?: { browser: string; os: string; };
}

// NEW INTERFACE: For Site data
interface Site {
  id: string;
  name: string;
  domain: string;
}


export default function Home() {
  // Initialize Supabase client for client-side use
  const supabase = createClientComponentClient();

  // --- AUTHENTICATION STATES ---
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true); // To manage initial session loading

  // --- SITE MANAGEMENT STATES ---
  const [sites, setSites] = useState<Site[]>([]); // List of sites for the logged-in user
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null); // Currently selected site ID

  // --- DASHBOARD DATA STATES (now site-specific) ---
  const [totalVisits, setTotalVisits] = useState<number>(0);
  const [visitsToday, setVisitsToday] = useState<number>(0);
  const [visits24Hours, setVisits24Hours] = useState<number>(0);
  const [visits7Days, setVisits7Days] = useState<number>(0);
  const [visits30Days, setVisits30Days] = useState<number>(0);
  const [uniqueVisitors, setUniqueVisitors] = useState<number>(0);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [dailyPageviews, setDailyPageviews] = useState<DailyPageView[]>([]);
  const [topReferrers, setTopReferrers] = useState<TopReferrer[]>([]);
  const [topUserAgents, setTopUserAgents] = useState<TopUserAgent[]>([]);

  // --- FILTERING STATES ---
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // --- LOADING & ERROR STATES ---
  const [isLoading, setIsLoading] = useState<boolean>(false); // For dashboard data fetching
  const [dashboardError, setDashboardError] = useState<string | null>(null); // For dashboard data errors


  // --- Helper functions ---
  // Ensure this `formatSupabaseDateTime` matches how your PostgreSQL functions expect timestamps
  // If your functions expect ISO strings (e.g., '2024-05-25T10:00:00.000Z'), using .toISOString() directly is better.
  // Given the previous error `Could not choose the best candidate function`, it implies your RPCs
  // are likely expecting `timestamp with time zone`. An ISO string (from .toISOString()) is the best representation for this.
  const formatSupabaseDateTime = (date: Date): string => {
      // Use toISOString for direct compatibility with PostgreSQL timestamp with time zone
      return date.toISOString();
  };

  const getStartOfTodayUtc = (): string => {
      const now = new Date();
      const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      return formatSupabaseDateTime(startOfTodayUtc);
  };

  const get24HoursAgoUtc = (): string => {
      const now = new Date();
      const date24HoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
      return formatSupabaseDateTime(date24HoursAgo);
  };

  const get7DaysAgoUtc = (): string => {
      const now = new Date();
      const date7DaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
      return formatSupabaseDateTime(date7DaysAgo);
  };

  const get30DaysAgoUtc = (): string => {
      const now = new Date();
      const date30DaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      return formatSupabaseDateTime(date30DaysAgo);
  };

  const parseUserAgent = (userAgentString: string | null): { browser: string; os: string; } => {
    if (!userAgentString || userAgentString === 'Unknown') {
      return { browser: 'Unknown', os: 'Unknown' };
    }
    const parser = new UAParser(userAgentString);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const browserName = browser.name ? `${browser.name}${browser.version ? ` ${browser.version.split('.')[0]}` : ''}` : 'Unknown Browser';
    const osName = os.name ? `${os.name}${os.version ? ` ${os.version}` : ''}` : 'Unknown OS';
    return { browser: browserName, os: osName };
  };


  // --- useEffect for handling authentication state changes and initial session check ---
  useEffect(() => {
    const checkInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoadingSession(false); // Finished checking session
    };

    checkInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setSession(currentSession);
        if (event === 'SIGNED_OUT') {
          // Clear all states if user signs out
          setSites([]);
          setSelectedSiteId(null);
          setTotalVisits(0);
          setVisitsToday(0);
          setVisits24Hours(0);
          setVisits7Days(0);
          setVisits30Days(0);
          setUniqueVisitors(0);
          setTopPages([]);
          setDailyPageviews([]);
          setTopReferrers([]);
          setTopUserAgents([]);
          setStartDate('');
          setEndDate('');
          setDashboardError(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);


  // --- useEffect for fetching user's sites when session changes ---
  useEffect(() => {
    const fetchUserSites = async () => {
      if (!session) {
        setSites([]);
        setSelectedSiteId(null);
        return;
      }

      setIsLoading(true); // General loading for sites
      setDashboardError(null);

      const { data, error } = await supabase
        .from('sites')
        .select('id, name, domain')
        .eq('user_id', session.user.id) // Ensure RLS is correctly set up for this
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching user sites:', error);
        setDashboardError('Failed to load your sites: ' + error.message);
        setSites([]);
        setSelectedSiteId(null);
      } else {
        setSites(data || []);
        if (data && data.length > 0) {
          // Automatically select the first site if available
          setSelectedSiteId(data[0].id);
        } else {
          setSelectedSiteId(null); // No sites available
        }
      }
      setIsLoading(false);
    };

    if (session && !loadingSession) { // Only fetch sites if logged in and session check is complete
      fetchUserSites();
    }
  }, [session, supabase, loadingSession]);


  // --- Function to fetch all dashboard data based on selected site and date filters ---
  // Wrapped in useCallback to prevent unnecessary re-creations and improve performance
  const fetchDashboardData = useCallback(async () => {
    // Only fetch if a site is selected and session is active
    if (!selectedSiteId || !session) {
      // Clear data if no site selected or not logged in
      setTotalVisits(0);
      setVisitsToday(0);
      setVisits24Hours(0);
      setVisits7Days(0);
      setVisits30Days(0);
      setUniqueVisitors(0);
      setTopPages([]);
      setDailyPageviews([]);
      setTopReferrers([]);
      setTopUserAgents([]);
      setDashboardError(null);
      return;
    }

    setIsLoading(true);
    setDashboardError(null);

    // --- IMPORTANT: Date Formatting for RPC calls ---
    let formattedStartDate: string | null = null;
    let formattedEndDate: string | null = null;

    if (startDate) {
        const dateObj = new Date(startDate + 'T00:00:00Z'); // Start of the day in UTC
        if (!isNaN(dateObj.getTime())) {
            formattedStartDate = formatSupabaseDateTime(dateObj); // This will now use .toISOString()
        } else {
            console.warn("Invalid start date string:", startDate);
        }
    }

    if (endDate) {
        const dateObj = new Date(endDate + 'T23:59:59Z'); // End of the day in UTC
        if (!isNaN(dateObj.getTime())) {
            formattedEndDate = formatSupabaseDateTime(dateObj); // This will now use .toISOString()
        } else {
            console.warn("Invalid end date string:", endDate);
        }
    }
    // --- END Date Formatting ---


    try {
      // --- Fetch Total Visits & Unique Visitors for the selected site ---
      const { data: countsData, error: countsError } = await supabase
        .rpc('count_pageviews_and_visitors_by_site', {
          p_site_id: selectedSiteId
        });

      if (countsError) {
        console.error('Error fetching total counts by site:', countsError.message);
        setTotalVisits(0);
        setUniqueVisitors(0);
      } else {
        setTotalVisits(countsData?.[0]?.total_pageviews || 0);
        setUniqueVisitors(countsData?.[0]?.total_unique_visitors || 0);
      }

      // --- Conditional Fetches for "Today", "Last 24 Hours", "Last 7 Days", "Last 30 Days" ---
      // These will only fetch if NO custom date range is applied AND a site is selected
      if (!formattedStartDate && !formattedEndDate) {
        const { count: todayCount, error: todayError } = await supabase
          .from('pageviews')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', selectedSiteId) // Filter by site_id
          .gte('ts', getStartOfTodayUtc());
        if (todayError) console.error("Error fetching visits today:", todayError.message);
        setVisitsToday(todayCount ?? 0);

        const { count: twentyFourHoursCount, error: twentyFourHoursError } = await supabase
          .from('pageviews')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', selectedSiteId) // Filter by site_id
          .gte('ts', get24HoursAgoUtc());
        if (twentyFourHoursError) console.error("Error fetching visits last 24 hours:", twentyFourHoursError.message);
        setVisits24Hours(twentyFourHoursCount ?? 0);

        const { count: sevenDaysCount, error: sevenDaysError } = await supabase
          .from('pageviews')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', selectedSiteId) // Filter by site_id
          .gte('ts', get7DaysAgoUtc());
        if (sevenDaysError) console.error("Error fetching visits last 7 days:", sevenDaysError.message);
        setVisits7Days(sevenDaysCount ?? 0);

        const { count: thirtyDaysCount, error: thirtyDaysError } = await supabase
          .from('pageviews')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', selectedSiteId) // Filter by site_id
          .gte('ts', get30DaysAgoUtc());
        if (thirtyDaysError) console.error("Error fetching visits last 30 days:", thirtyDaysError.message);
        setVisits30Days(thirtyDaysCount ?? 0);
      } else {
        // Clear these specific counts if a custom date range is applied
        setVisitsToday(0);
        setVisits24Hours(0);
        setVisits7Days(0);
        setVisits30Days(0);
      }

      // --- Fetch Top Pages using RPC Function with site_id ---
      const { data: topPagesData, error: topPagesError } = await supabase
        .rpc('get_top_pages', {
          start_date: formattedStartDate, // Passed as ISO string (timestamp with time zone)
          end_date: formattedEndDate,     // Passed as ISO string (timestamp with time zone)
          p_site_id: selectedSiteId       // Passed as TEXT
        });
      if (topPagesError) console.error("Error fetching top pages:", topPagesError.message);
      setTopPages(topPagesData as TopPage[] || []);

      // --- Fetch Daily Pageviews using RPC `get_daily_pageviews_for_chart` with site_id ---
      const { data: dailyData, error: dailyError } = await supabase
        .rpc('get_daily_pageviews_for_chart', {
          p_start_date: formattedStartDate, // Passed as ISO string (timestamp with time zone)
          p_end_date: formattedEndDate,     // Passed as ISO string (timestamp with time zone)
          p_site_id: selectedSiteId         // Passed as TEXT
        });
      if (dailyError) console.error('Error fetching daily pageviews for chart:', dailyError.message);
      setDailyPageviews(dailyData ? dailyData.map((d: any) => ({
        day: d.day_label,
        views: d.views_count,
      })) : []);

      // --- Fetch Top Referrers with site_id ---
      const { data: topReferrersData, error: topReferrersError } = await supabase
        .rpc('get_top_referrers', {
          start_date: formattedStartDate, // Passed as ISO string (timestamp with time zone)
          end_date: formattedEndDate,     // Passed as ISO string (timestamp with time zone)
          p_site_id: selectedSiteId       // Passed as TEXT
        });
      if (topReferrersError) console.error("Error fetching top referrers:", topReferrersError.message);
      setTopReferrers(topReferrersData as TopReferrer[] || []);

      // --- Fetch Top User Agents with site_id ---
      const { data: topUserAgentsData, error: topUserAgentsError } = await supabase
        .rpc('get_top_user_agents', {
          start_date: formattedStartDate, // Passed as ISO string (timestamp with time zone)
          end_date: formattedEndDate,     // Passed as ISO string (timestamp with time zone)
          p_site_id: selectedSiteId       // Passed as TEXT
        });
      if (topUserAgentsError) console.error("Error fetching top user agents:", topUserAgentsError.message);
      const parsedUserAgents = (topUserAgentsData as TopUserAgent[] || []).map(ua => ({
        ...ua,
        parsed: parseUserAgent(ua.user_agent),
      }));
      setTopUserAgents(parsedUserAgents);

    } catch (error: any) {
      console.error('Exception fetching dashboard data:', error);
      setDashboardError('An unexpected error occurred while loading data: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [session, selectedSiteId, startDate, endDate, supabase]); // Dependencies for useCallback


  // --- useEffect for triggering dashboard pageview tracking ---
  useEffect(() => {
    // Only track pageview for the dashboard's own page if a valid site ID is available
    // and the session is active (to prevent tracking during logout or initial load without session)
    if (session && !loadingSession) {  // Ensure not tracking during initial session loading
        // Track dashboard views against the currently selected *client site*.
        // This means if you switch between sites in the dashboard, the dashboard's own views
        // will be recorded against the *currently selected client site*.
        const trackingSiteIdForDashboardView = process.env.NEXT_PUBLIC_ANALYTICS_DASHBOARD_SITE_ID;

        // If you prefer to track dashboard views against a dedicated 'dashboard' site ID (fixed),
        // uncomment the line below and ensure you have NEXT_PUBLIC_ANALYTICS_DASHBOARD_SITE_ID configured.
        // const trackingSiteIdForDashboardView = process.env.NEXT_PUBLIC_ANALYTICS_DASHBOARD_SITE_ID || null;

        if (trackingSiteIdForDashboardView) {
          // Adding a small delay to ensure everything is ready before tracking
          const trackTimer = setTimeout(() => {
              trackPageView(trackingSiteIdForDashboardView, session.user.id);
          }, 500); // Increased delay slightly

          return () => clearTimeout(trackTimer); // Clean up timer
      } else {
            console.warn("Dashboard pageview not tracked: NEXT_PUBLIC_ANALYTICS_DASHBOARD_SITE_ID is not configured.");
        }
    }
  }, [session, loadingSession]); // Dependencies for tracking the dashboard's own pageview


  // --- useEffect for fetching dashboard data and managing Realtime subscriptions ---
  // Ensure this useEffect has startDate and endDate as dependencies
  useEffect(() => {
    // Only fetch dashboard data and manage subscriptions if logged in and a site is selected
    if (session && selectedSiteId) {
      const fetchTimer = setTimeout(() => {
        fetchDashboardData();
      }, 100); // Small delay for initial data fetch

      // --- Realtime Subscriptions (now site-specific) ---
      // Cleanup existing channels first
      const existingChannels = supabase.getChannels();
      for (const ch of existingChannels) {
        // Remove only the specific channels we are managing (pageviews and unique_visitors for any site)
        if (ch.topic.startsWith('realtime:pageviews_channel:') || ch.topic.startsWith('realtime:unique_visitors_channel:')) {
          supabase.removeChannel(ch);
          console.log('Removed existing channel:', ch.topic);
        }
      }

      // Re-subscribe to pageviews for the selected site
      const pageviewsChannel = supabase
          .channel(`realtime:pageviews_channel:${selectedSiteId}`)
          .on('postgres_changes', {
              event: 'INSERT',
              schema: 'public',
              table: 'pageviews',
              filter: `site_id=eq.${selectedSiteId}` // Filter by selected site ID
          }, (payload) => {
              console.log('Realtime Pageview Insert:', payload);
              // Trigger re-fetch of dashboard data to update counts
              fetchDashboardData();
          })
          .subscribe();

      // Re-subscribe to unique_visitors for the selected site
      const uniqueVisitorsChannel = supabase
          .channel(`realtime:unique_visitors_channel:${selectedSiteId}`)
          .on('postgres_changes', {
              event: 'INSERT',
              schema: 'public',
              table: 'unique_visitors',
              filter: `site_id=eq.${selectedSiteId}` // Filter by selected site ID
          }, (payload) => {
              console.log('Realtime Unique Visitor Insert:', payload);
              // Trigger re-fetch of dashboard data to update counts
              fetchDashboardData();
          })
          .subscribe();

      return () => {
          // Cleanup channels on unmount or when dependencies change
          supabase.removeChannel(pageviewsChannel);
          supabase.removeChannel(uniqueVisitorsChannel);
          clearTimeout(fetchTimer);
      };
    } else {
      // If no session or no site selected, ensure all channels are removed
      const existingChannels = supabase.getChannels();
      for (const ch of existingChannels) {
        if (ch.topic.startsWith('realtime:pageviews_channel:') || ch.topic.startsWith('realtime:unique_visitors_channel:')) {
          supabase.removeChannel(ch);
        }
      }
    }
  }, [session, selectedSiteId, supabase, fetchDashboardData, startDate, endDate]); // Added startDate, endDate, and fetchDashboardData to dependencies

  // --- Chart.js Data and Options (useMemo to optimize) ---
  const chartData = useMemo(() => {
    return {
      labels: dailyPageviews.map(data => data.day),
      datasets: [
        {
          label: 'Pageviews',
          data: dailyPageviews.map(data => data.views),
          fill: false,
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1,
        },
      ],
    };
  }, [dailyPageviews]);

  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        title: {
          display: true,
          text: 'Daily Pageviews',
        },
      },
      scales: {
        x: {
          type: 'category' as const, // Specify 'category' type for x-axis
          title: {
            display: true,
            text: 'Date',
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Pageviews',
          },
        },
      },
    };
  }, []);


  // --- Render Logic ---
  if (loadingSession) {
    return <div className="min-h-screen flex items-center justify-center text-xl text-gray-700">Loading session...</div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md border border-gray-200">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Sign In / Sign Up</h2>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            providers={['github']} // Add or remove providers as needed
            redirectTo={`${window.location.origin}/auth/callback`}
          />
        </div>
      </div>
    );
  }

  return (
    // Added a temporary class (bg-yellow-200) here to help force Tailwind's JIT compiler to re-scan.
    // If this background color appears, it indicates Tailwind utility classes are now being generated.
    <main className="min-h-screen bg-gray-100 p-4">
      {/* --- Header Section --- */}
      <header className="bg-white shadow-lg p-4 mb-6 rounded-lg flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0 md:space-x-4">
        <h1 className="text-3xl font-extrabold text-gray-900">Dashboard</h1>
        <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-4 w-full md:w-auto">
          {/* Site Selector */}
          <div className="w-full md:w-auto">
            <label htmlFor="site-select" className="sr-only">Select Site</label>
            <select
              id="site-select"
              value={selectedSiteId || ''}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              {sites.length === 0 ? (
                <option value="">No Sites Available</option>
              ) : (
                sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} ({site.domain})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* User & Links */}
          <div className="flex items-center space-x-4">
            <span className="text-gray-700 text-sm md:text-base">
              Logged in as: <span className="font-semibold">{session.user.email}</span>
            </span>
            <Link href="/dashboard/sites" className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 transition-colors duration-200">
              Manage Sites
            </Link>
            <Link href="/logout" className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition-colors duration-200">
              Logout
            </Link>
          </div>
        </div>
      </header>

      {/* --- Dashboard Data Display --- */}
      {dashboardError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {dashboardError}</span>
        </div>
      )}

      {isLoading && selectedSiteId && (
        <p className="text-blue-600 text-xl text-center mb-6">Loading dashboard data for selected site...</p>
      )}

      {!isLoading && !selectedSiteId && sites.length > 0 && (
        <p className="text-gray-600 text-xl text-center mb-6">Please select a site from the dropdown above to view its analytics.</p>
      )}

      {!isLoading && selectedSiteId && (
        <>
          {/* --- Navigation Links Section (for testing pageviews) --- */}
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
            </div>
          </div>

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
                onClick={fetchDashboardData} // Call the main data fetching function
                className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors duration-200 self-end"
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : 'Apply Filter'}
              </button>
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  // Setting state will trigger the useEffect to re-fetch with no filters
                }}
                className="px-6 py-3 bg-gray-400 text-white rounded-md hover:bg-gray-500 transition-colors duration-200 self-end"
                disabled={isLoading}
              >
                Clear Filter
              </button>
            </div>
          </div>

          {/* --- Main Analytics Counters Grid --- */}
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
                    <span className="font-medium truncate">{data.parsed?.browser || data.user_agent}</span>
                    <span className="font-bold text-gray-900">{data.count} visits</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No user agent data available yet.</p>
            )}
          </div>

          {/* --- NEW: Daily Pageviews Chart --- */}
          <div className="mt-10 bg-white p-8 rounded-lg shadow-xl max-w-4xl w-full mx-auto border border-gray-200">
            <h2 className="text-2xl font-extrabold text-gray-800 mb-4 text-center">Daily Pageviews</h2>
            {dailyPageviews.length > 0 ? (
              <div style={{ height: '300px' }}> {/* Set a fixed height for the chart */}
                <Line data={chartData} options={chartOptions} />
              </div>
            ) : (
              <p className="text-gray-500 text-center">No daily pageview data available for this range.</p>
            )}
          </div>

          <p className="text-center text-gray-500 text-sm mt-8">(Counts update in real-time when new visits are recorded!)</p>
        </>
      )}
    </main>
  );
}