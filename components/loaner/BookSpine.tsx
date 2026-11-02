"use client";

import React from "react";
import Link from "next/link";
import { formatAddress, formatDueStamp } from "@/lib/loaner";
import type { DetailedListing } from "@/lib/useLoaner";

interface BookSpineProps {
  listing: DetailedListing;
  isSelected?: boolean;
  onSelect?: (listing: DetailedListing) => void;
  asLink?: boolean;
}

export function BookSpine({
  listing,
  isSelected = false,
  onSelect,
  asLink = false,
}: BookSpineProps) {
  const { id, tokenId, tokenName, lender, shelfStyle, phase, dueAt } = listing;

  const content = (
    <div
      onClick={() => onSelect?.(listing)}
      className={[
        "relative flex flex-col justify-between items-center py-3 px-2 rounded-t-sm cursor-pointer select-none transition-all duration-200",
        "w-[48px] md:w-[54px] h-[220px] md:h-[240px] flex-shrink-0",
        isSelected
          ? "-translate-y-4 shadow-xl ring-2 ring-[var(--accent)]"
          : "hover:-translate-y-2 hover:shadow-lg hover:brightness-105",
      ].join(" ")}
      style={{
        backgroundColor: shelfStyle.bg,
        color: shelfStyle.fg,
        boxShadow: isSelected
          ? "0 10px 20px rgba(46, 31, 20, 0.3)"
          : "inset 2px 0 0 rgba(255, 255, 255, 0.2), inset -2px 0 0 rgba(0, 0, 0, 0.3), 2px 2px 5px rgba(0,0,0,0.2)",
      }}
    >
      {/* Top Spine Call-Number Emboss */}
      <div className="flex flex-col items-center gap-1 w-full border-b border-white/20 pb-1.5">
        <span className="font-mono text-[9px] font-bold tracking-tighter opacity-90">
          §{String(id)}
        </span>
        <span className="font-mono text-[8px] opacity-75">
          #{String(tokenId)}
        </span>
      </div>

      {/* Middle Spine Title (Rotated Vertical Text) */}
      <div
        className="flex-1 flex items-center justify-center py-2 overflow-hidden w-full"
        style={{
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
        }}
      >
        <div className="flex items-center gap-2 max-h-[130px] overflow-hidden text-ellipsis whitespace-nowrap">
          <span className="font-title text-[11px] md:text-xs font-bold tracking-tight">
            {tokenName}
          </span>
          <span className="font-mono text-[8px] opacity-70">
            • {formatAddress(lender)}
          </span>
        </div>
      </div>

      {/* Bottom Spine Status Ribbon */}
      <div className="w-full pt-1.5 border-t border-white/20 text-center">
        {phase === "available" && (
          <span className="inline-block px-1 py-0.5 rounded-xs text-[8px] font-mono uppercase font-bold bg-white/20 text-white">
            Avail
          </span>
        )}
        {phase === "rented" && (
          <span className="inline-block px-1 py-0.5 rounded-xs text-[7px] font-mono uppercase font-bold bg-black/40 text-amber-200">
            {formatDueStamp(dueAt).replace("DUE ", "")}
          </span>
        )}
        {phase === "overdue" && (
          <span className="inline-block px-1 py-0.5 rounded-xs text-[7px] font-mono uppercase font-bold bg-red-950/80 text-red-200">
            Grace
          </span>
        )}
        {phase === "forfeitable" && (
          <span className="inline-block px-1 py-0.5 rounded-xs text-[7px] font-mono uppercase font-bold bg-red-900 text-white">
            Claim
          </span>
        )}
        {phase === "delisted" && (
          <span className="inline-block px-1 py-0.5 rounded-xs text-[8px] font-mono uppercase font-bold bg-black/50 text-stone-300">
            Closed
          </span>
        )}
        {phase === "forfeited" && (
          <span className="inline-block px-1 py-0.5 rounded-xs text-[8px] font-mono uppercase font-bold bg-stone-900 text-stone-400">
            Kept
          </span>
        )}
      </div>
    </div>
  );

  if (asLink) {
    return (
      <Link href={`/loan/${String(id)}`} className="no-underline block">
        {content}
      </Link>
    );
  }

  return content;
}
