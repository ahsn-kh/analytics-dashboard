'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Session } from '@supabase/supabase-js';
import Link from 'next/link';

// --- NEW IMPORTS FOR AUTH UI ---
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';

// Define Site interface
interface Site {
  id: string;
  name: string;
  domain: string;
  user_id: string;
  created_at: string;
}

export default function ManageSitesPage() {
  const supabase = createClientComponentClient();

  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteName, setSiteName] = useState('');
  const [siteDomain, setSiteDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // --- Environment variable for Cloudflare Worker URL ---
  const cloudflareWorkerUrl = process.env.NEXT_PUBLIC_CLOUDFLARE_WORKER_URL;

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

  // --- Fetch user's sites ---
  const fetchSites = useCallback(async () => {
    if (!session?.user?.id) {
      setSites([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('sites')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Error fetching sites:', fetchError.message);
      setError('Failed to load your sites: ' + fetchError.message);
    } else {
      setSites(data || []);
    }
    setIsLoading(false);
  }, [session?.user?.id, supabase]);

  // --- Trigger fetchSites when session or supabase changes ---
  useEffect(() => {
    if (session && !loadingSession) {
      fetchSites();
    }
  }, [session, loadingSession, fetchSites]);

  // --- Handle adding a new site ---
  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id) {
      setError('You must be logged in to add a site.');
      return;
    }
    if (!siteName.trim() || !siteDomain.trim()) {
      setError('Site name and domain cannot be empty.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    const { data, error: insertError } = await supabase
      .from('sites')
      .insert({
        name: siteName.trim(),
        domain: siteDomain.trim(),
        user_id: session.user.id,
      })
      .select() // Select the inserted row to get its ID
      .single();

    if (insertError) {
      console.error('Error adding site:', insertError.message);
      if (insertError.code === '23505') { // Unique constraint violation
        setError('A site with this domain already exists for your account.');
      } else {
        setError('Failed to add site: ' + insertError.message);
      }
    } else {
      setSuccessMessage(`Site "${data.name}" added successfully!`);
      setSiteName('');
      setSiteDomain('');
      fetchSites(); // Re-fetch sites to update the list
    }
    setIsLoading(false);
  };

  // --- Handle deleting a site ---
  const handleDeleteSite = async (siteId: string, siteName: string) => {
    // Using custom modal/confirmation instead of window.confirm
    const confirmDelete = window.confirm(`Are you sure you want to delete "${siteName}"? This action cannot be undone.`);
    if (!confirmDelete) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    const { error: deleteError } = await supabase
      .from('sites')
      .delete()
      .eq('id', siteId)
      .eq('user_id', session?.user?.id); // Ensure user owns the site

    if (deleteError) {
      console.error('Error deleting site:', deleteError.message);
      setError('Failed to delete site: ' + deleteError.message);
    } else {
      setSuccessMessage(`Site "${siteName}" deleted successfully.`);
      fetchSites(); // Re-fetch sites to update the list
    }
    setIsLoading(false);
  };

  // --- Generate tracking snippet ---
  const generateTrackingSnippet = (siteId: string) => {
    if (!cloudflareWorkerUrl) {
      return `<!-- Error: Cloudflare Worker URL is not configured in Vercel environment variables. -->`;
    }
    return `<!-- Place this script in the <head> or just before the closing </body> tag of your website -->
<script>
  (function() {
    const WORKER_URL = '${cloudflareWorkerUrl}';
    const SITE_ID = '${siteId}';

    function trackPageView() {
      if (!WORKER_URL || !SITE_ID) {
        console.warn('Analytics tracking not configured: Worker URL or Site ID missing.');
        return;
      }
      const pageviewData = {
        site_id: SITE_ID,
        path: window.location.pathname,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent || null,
        browser_language: navigator.language || null,
        screen_resolution: \`\${window.screen.width}x\${window.screen.height}\`,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        // user_id: 'OPTIONAL_LOGGED_IN_USER_ID_FROM_THEIR_SITE', // If their site has logged-in users
      };
      fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pageviewData),
        credentials: 'include',
      })
      .then(response => { if (!response.ok) { return response.text().then(text => { throw new Error(text); }); } })
      .catch(error => { console.error('Analytics tracking error:', error.message || error); });
    }
    trackPageView();
    window.addEventListener('popstate', trackPageView);
  })();
</script>`;
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
          <p className="text-center text-gray-600 mb-4">Please log in to manage your sites.</p>
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
    <div className="min-h-screen bg-gray-100 p-4">
      <header className="bg-white shadow-lg p-4 mb-6 rounded-lg flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0 md:space-x-4">
        <h1 className="text-3xl font-extrabold text-gray-900">Manage Your Sites</h1>
        <div className="flex items-center space-x-4">
          <span className="text-gray-700 text-sm md:text-base">
            Logged in as: <span className="font-semibold">{session.user.email}</span>
          </span>
          <Link href="/" className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors duration-200">
            Back to Dashboard
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
      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Success!</strong>
          <span className="block sm:inline"> {successMessage}</span>
        </div>
      )}

      {/* --- Add New Site Form --- */}
      <div className="bg-white p-8 rounded-lg shadow-xl mb-8 max-w-2xl mx-auto border border-gray-200">
        <h2 className="text-2xl font-extrabold text-gray-800 mb-6 text-center">Add a New Website to Track</h2>
        <form onSubmit={handleAddSite} className="space-y-4">
          <div>
            <label htmlFor="siteName" className="block text-sm font-medium text-gray-700 mb-1">Website Name:</label>
            <input
              type="text"
              id="siteName"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g., My Personal Blog"
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="siteDomain" className="block text-sm font-medium text-gray-700 mb-1">Website Domain:</label>
            <input
              type="text"
              id="siteDomain"
              value={siteDomain}
              onChange={(e) => setSiteDomain(e.target.value)}
              placeholder="e.g., example.com (no https:// or /)"
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            disabled={isLoading}
          >
            {isLoading ? 'Adding Site...' : 'Add Site'}
          </button>
        </form>
      </div>

      {/* --- List of Existing Sites --- */}
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-4xl mx-auto border border-gray-200">
        <h2 className="text-2xl font-extrabold text-gray-800 mb-6 text-center">Your Registered Websites</h2>
        {isLoading && <p className="text-blue-600 text-center mb-4">Loading your sites...</p>}
        {!isLoading && sites.length === 0 ? (
          <p className="text-gray-500 text-center">You haven't registered any websites yet. Add one above!</p>
        ) : (
          <ul className="space-y-6">
            {sites.map((site) => (
              <li key={site.id} className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-start md:justify-between space-y-4 md:space-y-0 md:space-x-4">
                <div className="mb-4 sm:mb-0 sm:pr-4 flex-grow">
                  <h3 className="text-xl font-semibold text-blue-800">{site.name}</h3>
                  <p className="text-gray-700 font-mono text-sm break-all">{site.domain}</p>
                  <p className="text-gray-600 text-xs mt-2">API Key (Site ID): <span className="font-mono text-blue-900 break-all">{site.id}</span></p>

                  {/* Tracking Snippet Section */}
                  <div className="mt-4 bg-gray-100 p-3 rounded-md border border-gray-300 text-left">
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm">Tracking Snippet:</h4>
                    <pre className="bg-gray-200 p-2 rounded-sm text-xs font-mono overflow-auto whitespace-pre-wrap break-all">
                      {generateTrackingSnippet(site.id)}
                    </pre>
                    <button
                      onClick={() => {
                        const snippet = generateTrackingSnippet(site.id);
                        document.execCommand('copy'); // Using execCommand for broader compatibility in iframes
                        navigator.clipboard.writeText(snippet)
                          .then(() => alert('Tracking snippet copied to clipboard!')) // Using alert for simplicity
                          .catch(err => console.error('Failed to copy snippet:', err));
                      }}
                      className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-200 text-sm"
                    >
                      Copy Snippet
                    </button>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <button
                    onClick={() => handleDeleteSite(site.id, site.name)}
                    className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition-colors duration-200"
                    disabled={isLoading}
                  >
                    Delete Site
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
