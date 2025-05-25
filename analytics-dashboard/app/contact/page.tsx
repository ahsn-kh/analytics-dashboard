// app/contact/page.tsx
"use client";

import Link from 'next/link';
import { useEffect } from 'react';
import { trackPageView } from '@/lib/analytics';

export default function ContactPage() {
  useEffect(() => {
    trackPageView(); // Track page views for this new page
  }, []);

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