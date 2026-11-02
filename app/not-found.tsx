import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import { app } from "@/lib/app-config";

export default function NotFound() {
  return (
    <PageShell title="Catalogue Item Missing" description={app.tagline}>
      <Panel archival className="p-12 text-center max-w-lg mx-auto">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-14 h-14 rounded-xs flex items-center justify-center font-serif text-2xl font-bold text-white shadow-xs"
            style={{ backgroundColor: "var(--accent)" }}
          >
            404
          </div>
          <h2 className="font-title text-xl font-bold text-[var(--text-primary)]">
            Record Not in Archives
          </h2>
          <p className="text-xs font-serif text-[var(--text-secondary)] leading-relaxed">
            The catalogue record, listing shelf, or library slip you requested could not be located on this network.
          </p>
          <div className="mt-4">
            <Link
              href="/"
              className="inline-block px-4 py-2 rounded-xs text-xs font-serif font-bold bg-[var(--accent)] text-[var(--accent-ink)] hover:opacity-90 transition-opacity"
            >
              ← Return to Library Shelves
            </Link>
          </div>
        </div>
      </Panel>
    </PageShell>
  );
}
