'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Session } from '@supabase/supabase-js';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import Link from 'next/link';
import dynamic from 'next/dynamic'; // Import dynamic from next/dynamic

// Recharts for all charts (Daily Pageviews and Country Pageviews)
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';

// For User Agent Parsing
import { UAParser } from 'ua-parser-js'; // Ensure 'ua-parser-js' is installed

// Define types for your data structures
interface Site {
  id: string;
  name: string;
  domain: string;
  user_id: string;
  created_at: string;
}

interface TopPage {
  path: string;
  count: number;
}

interface DailyPageView {
  day_label: string;
  views_count: number;
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

interface CountryPageview {
  country: string;
  total_pageviews: number;
  latest_latitude: number | null;
  latest_longitude: number | null;
}

// Dynamically import MapContainer and L (Leaflet) to disable SSR
// This resolves the "window is not defined" error
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

// Import L directly for the icon fix, but ensure it's only used client-side
let L: typeof import('leaflet');
if (typeof window !== 'undefined') {
  L = require('leaflet');
  // Fix for default Leaflet icon issue with Webpack
  // https://github.com/PaulLeCam/react-leaflet/issues/453
  delete (L.Icon.Default.prototype as any)._getIconUrl; // Corrected typo here
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  });
}


export default function Dashboard() {
  const supabase = createClientComponentClient();

  // --- AUTHENTICATION STATES ---
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // --- SITE MANAGEMENT STATES ---
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  // --- DASHBOARD DATA STATES ---
  const [totalVisits, setTotalVisits] = useState<number | null>(null);
  const [uniqueVisitors, setUniqueVisitors] = useState<number | null>(null);
  const [visitsToday, setVisitsToday] = useState<number | null>(null);
  const [visits24Hours, setVisits24Hours] = useState<number | null>(null);
  const [visits7Days, setVisits7Days] = useState<number | null>(null);
  const [visits30Days, setVisits30Days] = useState<number | null>(null);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [dailyPageviews, setDailyPageviews] = useState<DailyPageView[]>([]);
  const [topReferrers, setTopReferrers] = useState<TopReferrer[]>([]);
  const [topUserAgents, setTopUserAgents] = useState<TopUserAgent[]>([]);
  const [countryPageviews, setCountryPageviews] = useState<CountryPageview[]>([]);

  // --- FILTERING STATES ---
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // --- LOADING & ERROR STATES ---
  const [isLoading, setIsLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Environment variables
  const cloudflareWorkerUrl = process.env.NEXT_PUBLIC_CLOUDFLARE_WORKER_URL;
  const dashboardSiteId = process.env.NEXT_PUBLIC_ANALYTICS_DASHBOARD_SITE_ID;

  // --- Helper functions ---
  // FIX: Wrap formatSupabaseDateTime in useCallback to ensure stability
  const formatSupabaseDateTime = useCallback((date: Date): string => {
    return date.toISOString();
  }, []); // Empty dependency array as it doesn't depend on anything external

  const getStartOfTodayUtc = useCallback((): string => {
    const now = new Date();
    const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    return formatSupabaseDateTime(startOfTodayUtc);
  }, [formatSupabaseDateTime]); // Dependency added

  const get24HoursAgoUtc = useCallback((): string => {
    const now = new Date();
    const date24HoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    return formatSupabaseDateTime(date24HoursAgo);
  }, [formatSupabaseDateTime]); // Dependency added

  const get7DaysAgoUtc = useCallback((): string => {
    const now = new Date();
    const date7DaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    return formatSupabaseDateTime(date7DaysAgo);
  }, [formatSupabaseDateTime]); // Dependency added

  const get30DaysAgoUtc = useCallback((): string => {
    const now = new Date();
    const date30DaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    return formatSupabaseDateTime(date30DaysAgo);
  }, [formatSupabaseDateTime]); // Dependency added

  const parseUserAgent = useCallback((userAgentString: string | null): { browser: string; os: string; } => {
    if (!userAgentString || userAgentString === 'Unknown') {
      return { browser: 'Unknown', os: 'Unknown' };
    }
    const parser = new UAParser(userAgentString);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const browserName = browser.name ? `${browser.name}${browser.version ? ` ${browser.version.split('.')[0]}` : ''}` : 'Unknown Browser';
    const osName = os.name ? `${os.name}${os.version ? ` ${os.version}` : ''}` : 'Unknown OS';
    return { browser: browserName, os: osName };
  }, []);

  // --- Fetch session on component mount ---
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoadingSession(false);
    };
    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setSession(currentSession);
        if (event === 'SIGNED_OUT') {
          // Clear all states if user signs out
          setSites([]);
          setSelectedSiteId(null);
          setTotalVisits(0);
          setUniqueVisitors(0);
          setVisitsToday(0);
          setVisits24Hours(0);
          setVisits7Days(0);
          setVisits30Days(0);
          setTopPages([]);
          setDailyPageviews([]);
          setTopReferrers([]);
          setTopUserAgents([]);
          setCountryPageviews([]);
          setStartDate('');
          setEndDate('');
          setDashboardError(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  // --- Fetch user's sites and set initial selected site ---
  useEffect(() => {
    const fetchUserSites = async () => {
      if (!session?.user?.id) {
        setSites([]);
        setSelectedSiteId(null);
        return;
      }

      setIsLoading(true); // General loading for sites
      setDashboardError(null);

      const { data, error: fetchError } = await supabase
        .from('sites')
        .select('id, name, domain, user_id, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching user sites:', fetchError.message);
        setDashboardError('Failed to load your sites: ' + fetchError.message);
        setSites([]);
        setSelectedSiteId(null);
      } else {
        setSites(data || []);
        if (data && data.length > 0) {
          const defaultSite = data.find(site => site.id === dashboardSiteId) || data[0];
          setSelectedSiteId(defaultSite.id);
        } else {
          setSelectedSiteId(null);
        }
      }
      setIsLoading(false);
    };

    if (session && !loadingSession) {
      fetchUserSites();
    }
  }, [session, loadingSession, supabase, dashboardSiteId]);


  // --- Track dashboard pageview (separate from client sites) ---
  const trackDashboardPageView = useCallback(async () => {
    if (!cloudflareWorkerUrl || !dashboardSiteId || !session?.user?.id) {
      console.warn('Dashboard tracking not configured: Worker URL, Dashboard Site ID, or session missing.');
      return;
    }
    try {
      const pageviewData = {
        site_id: dashboardSiteId,
        path: window.location.pathname,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent || null,
        browser_language: navigator.language || null,
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        user_id: session.user.id,
      };
      await fetch(cloudflareWorkerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pageviewData),
        credentials: 'include',
      });
    } catch (err) {
      console.error('Failed to track dashboard pageview:', err);
    }
  }, [cloudflareWorkerUrl, dashboardSiteId, session?.user?.id]);

  // This useEffect should only trigger once per page load to track the dashboard itself
  useEffect(() => {
    if (session && !loadingSession) {
      const trackTimer = setTimeout(() => {
        trackDashboardPageView();
      }, 500);
      return () => clearTimeout(trackTimer);
    }
  }, [session, loadingSession, trackDashboardPageView]); // Dependencies for tracking the dashboard's own pageview


  // --- Main data fetching logic ---
  const fetchDashboardData = useCallback(async () => {
    if (!selectedSiteId || !session?.user?.id) {
      setTotalVisits(0);
      setUniqueVisitors(0);
      setVisitsToday(0);
      setVisits24Hours(0);
      setVisits7Days(0);
      setVisits30Days(0);
      setTopPages([]);
      setDailyPageviews([]);
      setTopReferrers([]);
      setTopUserAgents([]);
      setCountryPageviews([]);
      setDashboardError(null);
      return;
    }

    setIsLoading(true);
    setDashboardError(null);

    let formattedStartDate: string | null = null;
    let formattedEndDate: string | null = null;

    if (startDate) {
      const dateObj = new Date(startDate + 'T00:00:00Z');
      if (!isNaN(dateObj.getTime())) {
        formattedStartDate = formatSupabaseDateTime(dateObj);
      } else {
        console.warn("Invalid start date string:", startDate);
      }
    }

    if (endDate) {
      const dateObj = new Date(endDate + 'T23:59:59Z');
      if (!isNaN(dateObj.getTime())) {
        formattedEndDate = formatSupabaseDateTime(dateObj);
      } else {
        console.warn("Invalid end date string:", endDate);
      }
    }

    try {
      // Fetch Total Visits & Unique Visitors for the selected site
      const { data: countsData, error: countsError } = await supabase
        .rpc('count_pageviews_and_visitors_by_site', {
          p_site_id: selectedSiteId as string // Supabase client handles UUID conversion from string
        });

      if (countsError) {
        console.error('Error fetching total counts by site:', countsError.message);
        setTotalVisits(0);
        setUniqueVisitors(0);
      } else {
        setTotalVisits(countsData?.[0]?.total_pageviews || 0);
        setUniqueVisitors(countsData?.[0]?.total_unique_visitors || 0);
      }

      // Conditional Fetches for "Today", "Last 24 Hours", "Last 7 Days", "Last 30 Days"
      if (!formattedStartDate && !formattedEndDate) {
        const { count: todayCount, error: todayError } = await supabase
          .from('pageviews')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', selectedSiteId)
          .gte('created_at', getStartOfTodayUtc());
        if (todayError) console.error("Error fetching visits today:", todayError.message);
        setVisitsToday(todayCount ?? 0);

        const { count: twentyFourHoursCount, error: twentyFourHoursError } = await supabase
          .from('pageviews')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', selectedSiteId)
          .gte('created_at', get24HoursAgoUtc());
        if (twentyFourHoursError) console.error("Error fetching visits last 24 hours:", twentyFourHoursError.message);
        setVisits24Hours(twentyFourHoursCount ?? 0);

        const { count: sevenDaysCount, error: sevenDaysError } = await supabase
          .from('pageviews')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', selectedSiteId)
          .gte('created_at', get7DaysAgoUtc());
        if (sevenDaysError) console.error("Error fetching visits last 7 days:", sevenDaysError.message);
        setVisits7Days(sevenDaysCount ?? 0);

        const { count: thirtyDaysCount, error: thirtyDaysError } = await supabase
          .from('pageviews')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', selectedSiteId)
          .gte('created_at', get30DaysAgoUtc());
        if (thirtyDaysError) console.error("Error fetching visits last 30 days:", thirtyDaysError.message);
        setVisits30Days(thirtyDaysCount ?? 0);
      } else {
        setVisitsToday(null);
        setVisits24Hours(null);
        setVisits7Days(null);
        setVisits30Days(null);
      }

      // Fetch Top Pages using RPC Function with site_id
      const { data: topPagesData, error: topPagesError } = await supabase
        .rpc('get_top_pages', {
          p_site_id: selectedSiteId,
          p_start_date: formattedStartDate,
          p_end_date: formattedEndDate,
        });
      if (topPagesError) console.error("Error fetching top pages:", topPagesError.message);
      setTopPages(topPagesData as TopPage[] || []);

      // Fetch Daily Pageviews using RPC `get_daily_pageviews_for_chart` with site_id
      const { data: dailyData, error: dailyError } = await supabase
        .rpc('get_daily_pageviews_for_chart', {
          p_site_id: selectedSiteId,
          p_start_date: formattedStartDate,
          p_end_date: formattedEndDate,
        });
      if (dailyError) console.error('Error fetching daily pageviews for chart:', dailyError.message);
      setDailyPageviews(dailyData ? dailyData.map((d: any) => ({
        day_label: d.day_label,
        views_count: d.views_count,
      })) : []);

      // Fetch Top Referrers with site_id
      const { data: topReferrersData, error: topReferrersError } = await supabase
        .rpc('get_top_referrers', {
          p_site_id: selectedSiteId,
          p_start_date: formattedStartDate,
          p_end_date: formattedEndDate,
        });
      if (topReferrersError) console.error("Error fetching top referrers:", topReferrersError.message);
      setTopReferrers(topReferrersData as TopReferrer[] || []);

      // Fetch Top User Agents with site_id
      const { data: topUserAgentsData, error: topUserAgentsError } = await supabase
        .rpc('get_top_user_agents', {
          p_site_id: selectedSiteId,
          p_start_date: formattedStartDate,
          p_end_date: formattedEndDate,
        });
      if (topUserAgentsError) console.error("Error fetching top user agents:", topUserAgentsError.message);
      const parsedUserAgents = (topUserAgentsData as TopUserAgent[] || []).map(ua => ({
        ...ua,
        parsed: parseUserAgent(ua.user_agent),
      }));
      setTopUserAgents(parsedUserAgents);

      // Fetch Country Pageviews using RPC
      const { data: countryData, error: countryError } = await supabase.rpc('get_country_pageviews', {
        p_site_id: selectedSiteId,
        p_start_date: formattedStartDate,
        p_end_date: formattedEndDate,
      });

      if (countryError) throw countryError;
      setCountryPageviews(countryData || []);

    } catch (error: any) {
      console.error('Exception fetching dashboard data:', error);
      setDashboardError('An unexpected error occurred while loading data: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSiteId, startDate, endDate, session, supabase, formatSupabaseDateTime, getStartOfTodayUtc, get24HoursAgoUtc, get7DaysAgoUtc, get30DaysAgoUtc, parseUserAgent]);


  // --- useEffect for triggering dashboard data fetch and managing Realtime subscriptions ---
  useEffect(() => {
    if (session && selectedSiteId) {
      const fetchTimer = setTimeout(() => {
        fetchDashboardData();
      }, 100);

      // --- Realtime Subscriptions (now site-specific) ---
      const channelPrefix = `realtime_site_${selectedSiteId}`; // Unique prefix per site
      const existingChannels = supabase.getChannels();

      // Remove only channels related to this specific site ID
      for (const ch of existingChannels) {
        if (ch.topic.startsWith(`realtime:pageviews_channel:${selectedSiteId}`) ||
            ch.topic.startsWith(`realtime:unique_visitors_channel:${selectedSiteId}`)) {
          supabase.removeChannel(ch);
          console.log('Removed existing channel:', ch.topic);
        }
      }

      const pageviewsChannel = supabase
        .channel(`realtime:pageviews_channel:${selectedSiteId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'pageviews',
          filter: `site_id=eq.${selectedSiteId}`
        }, (payload) => {
          console.log('Realtime Pageview Insert:', payload);
          fetchDashboardData();
        })
        .subscribe();

      const uniqueVisitorsChannel = supabase
        .channel(`realtime:unique_visitors_channel:${selectedSiteId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'unique_visitors',
          filter: `site_id=eq.${selectedSiteId}`
        }, (payload) => {
          console.log('Realtime Unique Visitor Insert:', payload);
          fetchDashboardData();
        })
        .subscribe();

      return () => {
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
  }, [session, selectedSiteId, supabase, fetchDashboardData, startDate, endDate]);


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
            providers={['github']}
            redirectTo={`${window.location.origin}/auth/callback`}
          />
        </div>
      </div>
    );
  }

  return (
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
                onClick={fetchDashboardData}
                className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors duration-200 self-end"
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : 'Apply Filter'}
              </button>
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
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

          {/* --- NEW: Daily Pageviews Chart (using Recharts) --- */}
          <div className="mt-10 bg-white p-8 rounded-lg shadow-xl max-w-4xl w-full mx-auto border border-gray-200">
            <h2 className="text-2xl font-extrabold text-gray-800 mb-4 text-center">Daily Pageviews</h2>
            {dailyPageviews.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyPageviews} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day_label" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="views_count" stroke="#8884d8" name="Pageviews" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center">No daily pageview data available for this range.</p>
            )}
          </div>

          {/* --- NEW: Geographical Data Section --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-10">
            {/* Country Pageviews Bar Chart */}
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Pageviews by Country</h2>
              {isLoading ? (
                <div className="h-64 flex items-center justify-center text-gray-500">Loading country data...</div>
              ) : countryPageviews.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={countryPageviews} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="country" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="total_pageviews" fill="#82ca9d" name="Pageviews" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center">No country pageview data for the selected period.</p>
              )}
            </div>

            {/* Map Visualization */}
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Pageviews Map</h2>
              {isLoading ? (
                <div className="h-64 flex items-center justify-center text-gray-500">Loading map...</div>
              ) : countryPageviews.some(c => c.latest_latitude !== null && c.latest_longitude !== null) ? (
                <div className="h-80 w-full rounded-md overflow-hidden">
                  {/* Only render MapContainer if L is defined (client-side) */}
                  {typeof window !== 'undefined' && L && (
                    <MapContainer
                      center={[0, 0]} // Default center, will adjust with data
                      zoom={2}
                      scrollWheelZoom={true}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      {countryPageviews.map((data, index) => (
                        data.latest_latitude !== null && data.latest_longitude !== null && (
                          <Marker key={index} position={[data.latest_latitude, data.latest_longitude]}>
                            <Popup>
                              <strong>{data.country}</strong><br />
                              Pageviews: {data.total_pageviews}
                            </Popup>
                          </Marker>
                        )
                      ))}
                    </MapContainer>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-center">No geographical data with coordinates available for the selected period.</p>
              )}
            </div>
          </div>
          <p className="text-center text-gray-500 text-sm mt-8">(Counts update in real-time when new visits are recorded!)</p>
        </>
      )}
    </main>
  );
}
