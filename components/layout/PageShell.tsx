"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import { footerLinks } from "@/lib/botchain/chain";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";

export type NavItem = { href: string; label: string };

interface PageShellProps {
  children: React.ReactNode;
  nav?: NavItem[];
  title?: string;
  description?: string;
}

const DEFAULT_NAV: NavItem[] = [
  { href: "/", label: "The Shelf" },
  { href: "/lend", label: "Lend a Token" },
  { href: "/me", label: "Library Desk" },
];

export default function PageShell({
  children,
  nav = DEFAULT_NAV,
  title,
  description,
}: PageShellProps) {
  const links = footerLinks();

  return (
    <div
      className="flex flex-col min-h-[100dvh] overflow-x-hidden"
      style={{
        backgroundColor: "var(--bg-base)",
        color: "var(--text-primary)",
      }}
    >
      {/* Library Catalogue Masthead */}
      <header
        className="sticky top-0 z-30 flex-shrink-0 border-b shadow-xs"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
        }}
      >
        <div className="mx-auto w-full max-w-[1020px] px-4 md:px-6">
          <div className="flex items-center justify-between gap-3 py-3">
            <Link href="/" className="flex items-center gap-3 no-underline group">
              <div
                className="w-8 h-8 rounded-sm flex items-center justify-center font-serif text-sm font-bold text-white shadow-xs transition-transform group-hover:scale-105"
                style={{ backgroundColor: "var(--accent)" }}
              >
                §
              </div>
              <div>
                <span
                  className="font-title text-lg font-bold tracking-tight block leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {app.name}
                </span>
                <span
                  className="font-mono text-[10px] uppercase tracking-wider block"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  ERC-721 Lending Archive
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-2.5">
              <NetworkBadge />
              <div className="w-[150px] md:w-[170px] flex-shrink-0">
                <ConnectButton />
              </div>
            </div>
          </div>

          {/* Library Ledger Navigation */}
          {nav.length > 0 && <LibraryNav items={nav} />}
        </div>
      </header>

      {/* Main Reading Room */}
      <main className="flex-1 w-full max-w-[1020px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {(title || description) && (
          <div className="mb-6 pb-4 border-b border-[var(--border-subtle)]">
            {title && (
              <h1 className="font-title text-2xl md:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                {title}
              </h1>
            )}
            {description && (
              <p className="mt-1.5 text-xs md:text-sm text-[var(--text-secondary)] font-serif leading-relaxed">
                {description}
              </p>
            )}
          </div>
        )}
        {children}
      </main>

      {/* 3-Link Shared Footer Contract */}
      <footer
        className="mt-auto border-t flex-shrink-0 py-6 text-xs font-mono"
        style={{
          borderColor: "var(--border-subtle)",
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-secondary)",
        }}
      >
        <div className="mx-auto w-full max-w-[1020px] px-4 md:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <a
              href={links.site}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--accent)] transition-colors hover:underline"
            >
              botchain.ai
            </a>
            <span style={{ color: "var(--border-strong)" }}>•</span>
            <a
              href={links.explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--accent)] transition-colors hover:underline"
            >
              scan.botchain.ai
            </a>
          </div>

          <div>
            <BuiltOnBotChain />
          </div>
        </div>
      </footer>
    </div>
  );
}

function LibraryNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 border-t border-[var(--border-subtle)] pt-1 -mb-[1px]">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 text-xs font-serif transition-colors border-b-2 ${
              active
                ? "border-[var(--accent)] text-[var(--accent)] font-bold"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
