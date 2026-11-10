import Image from "next/image";
import Link from "next/link";

// The logo's wordmark as text rather than the PNG: the image prints "DATA" in
// black, which disappears on the dark sidebar, and text stays sharp at any size.
export function Wordmark({
  tone = "light",
  className = "",
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  const accent = tone === "dark" ? "text-brand-300" : "text-brand-600";
  const middle = tone === "dark" ? "text-white" : "text-foreground";
  return (
    <span className={`font-extrabold tracking-[0.06em] ${className}`}>
      <span className={accent}>TE</span>
      <span className={middle}>DATA</span>
      <span className={accent}>ONE</span>
    </span>
  );
}

export function Logo({
  href = "/",
  tone = "light",
  size = 32,
  className = "",
}: {
  href?: string;
  tone?: "light" | "dark";
  size?: number;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="TeDataOne"
      className={`inline-flex items-center gap-2.5 ${className}`}
    >
      <span
        className={
          tone === "dark"
            ? // bg-[#fff], not bg-white: globals.css repaints .bg-white in dark mode.
              "grid place-items-center rounded-lg bg-[#fff] p-1 shadow-sm"
            : "grid place-items-center"
        }
      >
        {/* The mark is 777x743, not square. */}
        <Image
          src="/logo-mark.png"
          alt=""
          width={size}
          height={Math.round((size * 743) / 777)}
          priority
        />
      </span>
      <Wordmark tone={tone} className="text-lg leading-none" />
    </Link>
  );
}
