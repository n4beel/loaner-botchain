"use client";

import React from "react";
import { BookSpine } from "./BookSpine";
import type { DetailedListing } from "@/lib/useLoaner";

interface LibraryShelfProps {
  listings: DetailedListing[];
  selectedListing?: DetailedListing | null;
  onSelectListing?: (listing: DetailedListing) => void;
  loading?: boolean;
  asLinks?: boolean;
}

export function LibraryShelf({
  listings,
  selectedListing,
  onSelectListing,
  loading = false,
  asLinks = false,
}: LibraryShelfProps) {
  if (loading) {
    return (
      <div className="w-full p-12 text-center font-serif text-sm text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-sm">
        Browsing library shelves and catalogued tokens...
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="w-full p-12 text-center font-serif text-sm text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-sm">
        The lending library shelf is currently empty. Use the Lend tab to deposit and list the first token.
      </div>
    );
  }

  // Group listings in rows of up to 12 spines per shelf for authentic library bookcase look
  const chunkSize = 12;
  const shelves: DetailedListing[][] = [];
  for (let i = 0; i < listings.length; i += chunkSize) {
    shelves.push(listings.slice(i, i + chunkSize));
  }

  return (
    <div className="flex flex-col gap-10 w-full py-4">
      {shelves.map((shelfListings, idx) => (
        <div key={`shelf-${idx}`} className="flex flex-col">
          {/* Books standing side by side */}
          <div className="flex flex-wrap items-end gap-1.5 md:gap-2 px-3 md:px-6 pt-6">
            {shelfListings.map((l) => (
              <BookSpine
                key={String(l.id)}
                listing={l}
                isSelected={selectedListing?.id === l.id}
                onSelect={onSelectListing}
                asLink={asLinks}
              />
            ))}
          </div>

          {/* Wooden shelf board underneath */}
          <div className="library-shelf-board h-4 w-full bg-[#8A5A36] rounded-xs" />
        </div>
      ))}
    </div>
  );
}
