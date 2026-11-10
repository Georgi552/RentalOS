import Image from "next/image";
import { Logo, Wordmark } from "@/components/brand";
import { Icon, type IconName } from "@/components/icons";

const POINTS: { icon: IconName; text: string }[] = [
  { icon: "bills", text: "Фактурите за ток, вода и парно се четат сами" },
  { icon: "statement", text: "Всеки наемател получава справка какво дължи" },
  { icon: "rent", text: "Наеми, плащания и разходи на едно място" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-1">
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-linear-to-br from-brand-950 via-brand-900 to-brand-700 p-12 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-brand-300/15 blur-3xl"
        />
        <Logo href="/" tone="dark" size={32} />

        <div className="relative">
          <h2 className="text-3xl leading-tight font-bold tracking-tight">
            Сметките и наемите ти,
            <br />
            <span className="text-brand-300">подредени всеки месец.</span>
          </h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((point) => (
              <li key={point.text} className="flex items-center gap-3 text-sm text-brand-100">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10">
                  <Icon name={point.icon} className="h-[18px] w-[18px] text-brand-300" />
                </span>
                {point.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-200/60">© TeDataOne</p>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-8 flex flex-col items-center lg:hidden">
          <Image src="/logo-mark.png" alt="" width={56} height={56} priority />
          <Wordmark className="mt-3 text-xl" />
        </div>
        <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
