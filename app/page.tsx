import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { Icon, type IconName } from "@/components/icons";

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "bills",
    title: "Фактурите се четат сами",
    text: "Електрохолд, Софийска вода и Топлофикация — качи PDF или го препрати по имейл.",
  },
  {
    icon: "statement",
    title: "Справка за всеки наемател",
    text: "Какво дължи за месеца, изпратено по график, без смятане на ръка.",
  },
  {
    icon: "tenants",
    title: "Профил за наемателя",
    text: "С достъп до всички фактури и сметки.",
  },
];

export default function HomePage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-linear-to-b from-brand-50 to-transparent dark:from-brand-950/60"
      />

      <section className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 pt-16 pb-12 text-center sm:px-6 sm:pt-20">
        {/* The mark plus a text wordmark rather than logo.png, whose black
            "DATA" would vanish on the dark theme. */}
        <Image
          src="/logo-mark.png"
          alt=""
          width={128}
          height={122}
          priority
          className="h-auto w-24 sm:w-28"
        />
        <Wordmark className="mt-4 text-3xl sm:text-4xl" />

        <h1 className="mt-10 max-w-2xl text-3xl leading-tight font-bold tracking-tight sm:text-5xl">
          Наемите и сметките <span className="text-brand-600 dark:text-brand-300">на едно място.</span>
        </h1>
        <p className="mt-4 max-w-xl text-base text-neutral-500 sm:text-lg">
          Сметки, наеми и справки.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-neutral-700"
          >
            Започни
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold hover:bg-neutral-50"
          >
            Вход
          </Link>
        </div>

        <ul className="mt-16 grid w-full gap-4 text-left sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon name={feature.icon} className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-sm font-semibold">{feature.title}</h2>
              <p className="mt-1 text-sm text-neutral-500">{feature.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="relative border-t border-neutral-200 py-6 text-center text-xs text-neutral-500">
        © TeDataOne · tedataone.com
      </footer>
    </main>
  );
}
