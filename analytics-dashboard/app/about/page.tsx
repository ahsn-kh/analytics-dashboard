// app/about/page.tsx
"use client"; // If you need client-side features like useState, useEffect, etc.

import Link from 'next/link';
import { useEffect } from 'react';
import { trackPageView } from '@/lib/analytics'; // Assuming your analytics setup

export default function AboutPage() {
  useEffect(() => {
    trackPageView(); // Track page views for this new page
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-xl w-full">
        <h1 className="text-3xl font-extrabold text-blue-700 mb-4">About Our Awesome Website</h1>
        <p className="text-gray-700 mb-6">
          We are dedicated to providing the best content and services.
          This is an example of a new page.
        </p>
        <Link href="/" className="text-blue-500 hover:underline">
          Go back to Home
        </Link>
      </div>
    </div>
  );
}