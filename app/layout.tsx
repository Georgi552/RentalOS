import type { Metadata, Viewport } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";

// Cyrillic is the language of the whole interface, so it has to be a subset
// the font is loaded with - Geist was loaded as latin only and every Bulgarian
// word fell back to the system font.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "TeDataOne",
    template: "%s · TeDataOne",
  },
  description: "Наеми, сметки и справки за частни наемодатели.",
};

export const viewport: Viewport = {
  themeColor: "#0e3a30",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="bg"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
