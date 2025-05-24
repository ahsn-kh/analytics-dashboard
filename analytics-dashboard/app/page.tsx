// app/page.tsx

// 1. Import the Supabase client helper.
//    Make sure the path '@/lib/supabase' is correct for your project setup.
import { supabase } from '@/lib/supabase';

// 2. This is your main page component.
//    In the Next.js App Router, components in 'app/' are Server Components by default.
//    Making it 'async' allows you to perform data fetching directly inside it.
export default async function Home() {

  // --- Server-Side Data Operations ---

  // A. Insert a new pageview record into Supabase.
  //    This runs on the server every time this page is requested (loaded or refreshed).
  //    Assumes your 'pageviews' table has 'id' and 'created_at' columns with default values (like UUID and NOW()).
  //    If you have other 'NOT NULL' columns without defaults, you'll need to provide values in the '{}' object.
  const { data: newPageView, error: insertError } = await supabase
    .from('pageviews')
    .insert({}) // Inserting an empty object uses default values for columns
    .select(); // Select the inserted row to confirm success

  if (insertError) {
    console.error("Error inserting new pageview:", insertError.message);
    // If you see '42501', it often points to a Supabase Row Level Security (RLS) policy preventing inserts.
    if (insertError.code === '42501') {
        console.error("Potential RLS issue: User does not have INSERT permission. Check your Supabase RLS policies for the 'pageviews' table.");
    }
  } else {
    // console.log("Successfully inserted new pageview:", newPageView);
    // You can uncomment the line above during development to see confirmation in your terminal (server logs).
  }

  // B. Fetch the *latest* total count of pageviews from Supabase.
  //    This runs after the potential new pageview has been inserted.
  const { count, error: fetchCountError } = await supabase
    .from('pageviews')
    .select('*', { count: 'exact', head: true }); // 'count: 'exact', head: true' is optimized for just getting the count

  if (fetchCountError) {
    console.error("Error fetching total pageview count:", fetchCountError.message);
  }

  // Ensure 'total' is always a number, defaulting to 0 if 'count' is null.
  const total = count ?? 0;

  // console.log(`Current total pageviews fetched: ${total}`);
  // Uncomment the line above during development to see the count in your terminal (server logs).

  // --- UI Rendering ---

  // This is the JSX that will be rendered on the client-side.
  // It uses the 'total' value fetched on the server.
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-sm w-full">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-700 mb-4">
          Total Website Visits
        </h1>
        <p className="text-6xl sm:text-7xl font-bold text-gray-900 leading-none">
          {total}
        </p>
        <p className="mt-4 text-sm text-gray-500">
          (Refresh the page to see updates if not real-time)
        </p>
      </div>
    </div>
  );
}