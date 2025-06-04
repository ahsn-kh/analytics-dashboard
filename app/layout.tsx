import type { Metadata } from "next"; // <<< UNCOMMENTED THIS LINE
import { Inter } from "next/font/google"; // Using Inter, which is standard

import "./globals.css";

const inter = Inter({ subsets: ["latin"] }); // Initialize Inter font

export const metadata: Metadata = {
  title: "Analytics Dashboard", // Updated title
  description: "Your comprehensive analytics dashboard", // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={inter.className} // Using Inter font class
        // className="antialiased" // Removed antialiased for simplicity, add back if needed
      >
        {children}
      </body>
    </html>
  );
}
