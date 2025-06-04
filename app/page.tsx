'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Session } from '@supabase/supabase-js';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'; // For the map
import 'leaflet/dist/leaflet.css'; // Leaflet CSS
import L from 'leaflet'; // Leaflet library for custom marker icon

// Fix for default Leaflet icon issue with Webpack
// https://github.com/PaulLeCam/react-leaflet/issues/453
delete (L.Icon.Default.prototype as any)._get  IconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});


// Define Site interface
interface Site {
  id: string;
  name: string;
  domain: string;
  user_id: string;
  created_at: string;
}

// Define GeoData interface
interface CountryPageview {
  country: string;
  total_pageviews: number;
  latest_latitude: number | null;
  latest_longitude: number | null;
}

export default function Dashboard() {
  const supabase = createClientComponentClient();

  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [totalVisits, setTotalVisits] = useState<number | null>(null);
  const [uniqueVisitors, setUniqueVisitors] = useState<number | null>(null);
  const [visitsToday, setVisitsToday] = useState<number | null>(null);
  const [dailyPageviews, setDailyPageviews] = useState<any[]>([]);
  const [topPages, setTopPages] = useState<any[]>([]);
  const [countryPageviews, setCountryPageviews] = useState<CountryPageview[]>([]); // New state for geo data

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Environment variable for Cloudflare Worker URL
  const cloudflareWorkerUrl = process.env.NEXT_PUBLIC_CLOUDFLARE_WORKER_URL;
  // Dedicated Site ID for the dashboard's own analytics
  const dashboardSiteId = process.env.NEXT_PUBLIC_ANALYTICS_DASHBOARD_SITE_ID;

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
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  // --- Fetch user's sites and set initial selected site ---
  useEffect(() => {
    const fetchSites = async () => {
      if (!session?.user?.id) return;
      const { data, error: fetchError } = await supabase
        .from('sites')
        .select('id, name, domain')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching sites:', fetchError.message);
        setError('Failed to load your sites.');
      } else {
        setSites(data || []);
        // Set the first site as default selected, or the dashboard site if available
        if (data && data.length > 0) {
          const defaultSite = data.find(site => site.id === dashboardSiteId) || data[0];
          setSelectedSiteId(defaultSite.id);
        } else {
          setSelectedSiteId(null);
        }
      }
    };

    if (session && !loadingSession) {
      fetchSites();
    }
  }, [session, loadingSession, supabase, dashboardSiteId]);

  // --- Track dashboard pageview (separate from client sites) ---
  useEffect(() => {
    const trackPageView = async (siteId: string, userId: string) => {
      if (!cloudflareWorkerUrl) {
        console.warn('Dashboard tracking not configured: Cloudflare Worker URL missing.');
        return;
      }
      try {
        const pageviewData = {
          site_id: siteId,
          path: window.location.pathname,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent || null,
          browser_language: navigator.language || null,
          screen_resolution: `${window.screen.width}x${window.screen.height}`,
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight,
          user_id: userId,
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
    };

    if (session && !loadingSession && dashboardSiteId) {
      const trackTimer = setTimeout(() => {
        trackPageView(dashboardSiteId, session.user.id);
      }, 500);
      return () => clearTimeout(trackTimer);
    }
  }, [session, loadingSession, dashboardSiteId, cloudflareWorkerUrl]);


  // --- Main data fetching logic ---
  const fetchData = useCallback(async () => {
    if (!selectedSiteId || !session?.user?.id) {
      setTotalVisits(0);
      setUniqueVisitors(0);
      setVisitsToday(0);
      setDailyPageviews([]);
      setTopPages([]);
      setCountryPageviews([]); // Clear geo data
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch Total Visits
      const { data: totalData, error: totalError } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact' })
        .eq('site_id', selectedSiteId)
        .gte('created_at', startDate || '1970-01-01T00:00:00Z')
        .lte('created_at', endDate ? `${endDate}T23:59:59Z` : new Date().toISOString());

      if (totalError) throw totalError;
      setTotalVisits(totalData?.length || 0);

      // Fetch Unique Visitors
      const { data: uniqueData, error: uniqueError } = await supabase
        .from('unique_visitors')
        .select('*', { count: 'exact' })
        .eq('site_id', selectedSiteId)
        .gte('date', startDate || '1970-01-01')
        .lte('date', endDate || new Date().toISOString().split('T')[0]);

      if (uniqueError) throw uniqueError;
      setUniqueVisitors(uniqueData?.length || 0);

      // Fetch Visits Today
      const today = new Date().toISOString().split('T')[0];
      const { data: visitsTodayData, error: visitsTodayError } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact' })
        .eq('site_id', selectedSiteId)
        .gte('created_at', `${today}T00:00:00Z`)
        .lte('created_at', `${today}T23:59:59Z`);

      if (visitsTodayError) throw visitsTodayError;
      setVisitsToday(visitsTodayData?.length || 0);

      // Fetch Daily Pageviews (Materialized View)
      const { data: dailyData, error: dailyError } = await supabase
        .from('daily_pageviews_mv')
        .select('date, total_pageviews')
        .eq('site_id', selectedSiteId)
        .gte('date', startDate || '1970-01-01')
        .lte('date', endDate || new Date().toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (dailyError) throw dailyError;
      setDailyPageviews(dailyData || []);

      // Fetch Top Pages
      const { data: topPagesData, error: topPagesError } = await supabase
        .from('pageviews')
        .select('path', { count: 'exact' })
        .eq('site_id', selectedSiteId)
        .gte('created_at', startDate || '1970-01-01T00:00:00Z')
        .lte('created_at', endDate ? `${endDate}T23:59:59Z` : new Date().toISOString())
        .order('count', { ascending: false }) // Order by count
        .limit(10); // Limit to top 10 pages

      if (topPagesError) throw topPagesError;
      // Manually group and count paths as direct count on select is not working as expected for distinct paths
      const aggregatedTopPages = topPagesData?.reduce((acc: { [key: string]: number }, curr: { path: string }) => {
        acc[curr.path] = (acc[curr.path] || 0) + 1;
        return acc;
      }, {});
      const sortedTopPages = Object.entries(aggregatedTopPages || {})
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Ensure top 10

      setTopPages(sortedTopPages || []);

      // --- NEW: Fetch Country Pageviews using RPC ---
      const { data: countryData, error: countryError } = await supabase.rpc('get_country_pageviews', {
        p_site_id: selectedSiteId,
        p_start_date: startDate || '1970-01-01T00:00:00Z',
        p_end_date: endDate ? `${endDate}T23:59:59Z` : new Date().toISOString(),
      });

      if (countryError) throw countryError;
      setCountryPageviews(countryData || []);

    } catch (fetchError: any) {
      console.error('Error fetching dashboard data:', fetchError.message);
      setError('Failed to load dashboard data: ' + fetchError.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSiteId, startDate, endDate, session?.user?.id, supabase]);

  // --- Trigger data fetch when dependencies change ---
  useEffect(() => {
    if (session && selectedSiteId) {
      fetchData();
    }
  }, [selectedSiteId, startDate, endDate, session, fetchData]);

  // --- Handle date filter application ---
  const handleApplyFilter = () => {
    fetchData(); // Re-fetch data with new date range
  };

  // --- Handle date filter clearing ---
  const handleClearFilter = () => {
    setStartDate('');
    setEndDate('');
    // fetchData will be triggered by useEffect due to state change
  };

  // --- Handle session loading and non-logged-in state ---
  if (loadingSession) {
    return <div className="min-h-screen flex items-center justify-center text-xl text-gray-700">Loading authentication...</div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md border border-gray-200">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Sign In / Sign Up</h2>
          <p className="text-center text-gray-600 mb-4">Please log in to view your dashboard.</p>
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

  // --- Render Dashboard ---
  const selectedSite = sites.find(site => site.id === selectedSiteId);

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <header className="bg-white shadow-lg p-4 mb-6 rounded-lg flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0 md:space-x-4">
        <h1 className="text-3xl font-extrabold text-gray-900">Dashboard</h1>
        <div className="flex items-center space-x-4">
          <label htmlFor="site-select" className="sr-only">Select Site</label>
          <select
            id="site-select"
            value={selectedSiteId || ''}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-gray-700"
          >
            {sites.length === 0 ? (
              <option value="">No sites available</option>
            ) : (
              sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.domain})
                </option>
              ))
            )}
          </select>
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
      </header>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}

      {!selectedSiteId && !isLoading && sites.length > 0 && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Heads up!</strong>
          <span className="block sm:inline"> Please select a site from the dropdown to view analytics.</span>
        </div>
      )}
      {!selectedSiteId && !isLoading && sites.length === 0 && (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Welcome!</strong>
          <span className="block sm:inline"> You haven't added any sites yet. Go to <Link href="/dashboard/sites" className="underline font-semibold">Manage Sites</Link> to add your first website.</span>
        </div>
      )}

      {selectedSiteId && (
        <>
          {/* --- Date Filter Section --- */}
          <div className="bg-white p-6 rounded-lg shadow-md mb-6 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Filter by Date Range:</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">Start Date:</label>
                <input
                  type="date"
                  id="start-date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">End Date:</label>
                <input
                  type="date"
                  id="end-date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleApplyFilter}
                  className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Apply Filter
                </button>
                <button
                  onClick={handleClearFilter}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Clear Filter
                </button>
              </div>
            </div>
          </div>

          {/* --- Core Metrics --- */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 text-center">
              <h3 className="text-lg font-semibold text-gray-700">Total Visits</h3>
              <p className="text-4xl font-bold text-blue-600 mt-2">{isLoading ? '...' : totalVisits}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 text-center">
              <h3 className="text-lg font-semibold text-gray-700">Unique Visitors</h3>
              <p className="text-4xl font-bold text-green-600 mt-2">{isLoading ? '...' : uniqueVisitors}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 text-center">
              <h3 className="text-lg font-semibold text-gray-700">Visits Today</h3>
              <p className="text-4xl font-bold text-purple-600 mt-2">{isLoading ? '...' : visitsToday}</p>
            </div>
          </div>

          {/* --- Daily Pageviews Chart --- */}
          <div className="bg-white p-6 rounded-lg shadow-md mb-6 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Daily Pageviews</h2>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center text-gray-500">Loading chart...</div>
            ) : dailyPageviews.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyPageviews} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total_pageviews" fill="#8884d8" name="Pageviews" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center">No daily pageview data for the selected period.</p>
            )}
          </div>

          {/* --- Top Pages --- */}
          <div className="bg-white p-6 rounded-lg shadow-md mb-6 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Top Pages</h2>
            {isLoading ? (
              <div className="h-32 flex items-center justify-center text-gray-500">Loading top pages...</div>
            ) : topPages.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {topPages.map((page, index) => (
                  <li key={index} className="py-3 flex justify-between items-center text-gray-700">
                    <span className="truncate flex-grow mr-4">{page.path}</span>
                    <span className="font-semibold text-blue-600">{page.count} visits</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-center">No top page data for the selected period.</p>
            )}
          </div>

          {/* --- NEW: Geographical Data Section --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
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
              ) : countryPageviews.some(c => c.latest_latitude && c.latest_longitude) ? (
                <div className="h-80 w-full rounded-md overflow-hidden">
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
                </div>
              ) : (
                <p className="text-gray-500 text-center">No geographical data with coordinates available for the selected period.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
