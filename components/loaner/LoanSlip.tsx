"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { formatAddress, formatBot, formatDueStamp, quote, ListingState } from "@/lib/loaner";
import type { DetailedListing } from "@/lib/useLoaner";
import Button from "@/components/ui/Button";

interface LoanSlipProps {
  listing: DetailedListing;
  currentUser?: Address;
  onRent?: (days_: number, paymentWei: bigint) => Promise<any>;
  onReturn?: () => Promise<any>;
  onClaim?: () => Promise<any>;
  onDelist?: () => Promise<any>;
  onApproveReturn?: () => Promise<any>;
  isActionPending?: boolean;
}

export function LoanSlip({
  listing,
  currentUser,
  onRent,
  onReturn,
  onClaim,
  onDelist,
  onApproveReturn,
  isActionPending = false,
}: LoanSlipProps) {
  const {
    id,
    tokenId,
    tokenName,
    tokenSymbol,
    nft,
    lender,
    renter,
    pricePerDay,
    deposit,
    maxDays,
    state,
    phase,
    dueAt,
    held,
    metadata,
    approval,
  } = listing;

  const isLender = Boolean(
    currentUser && lender && currentUser.toLowerCase() === lender.toLowerCase()
  );
  const isRenter = Boolean(
    currentUser && renter && currentUser.toLowerCase() === renter.toLowerCase()
  );

  const [rentalDays, setRentalDays] = useState<number>(1);

  const totalCostWei = quote(pricePerDay, deposit, rentalDays);

  const handleRentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRent) return;
    await onRent(rentalDays, totalCostWei);
  };

  return (
    <div className="catalogue-slip p-6 md:p-8 rounded-sm relative max-w-xl mx-auto w-full text-[var(--text-primary)]">
      {/* Catalogue Card Header */}
      <div className="flex items-start justify-between border-b-2 border-[#9E7D59] pb-4 mb-6">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-secondary)] block">
            LOAN RECORD §{String(id)} • {tokenSymbol}
          </span>
          <h2 className="font-title text-xl md:text-2xl font-bold tracking-tight mt-0.5">
            {tokenName}
          </h2>
          <p className="font-mono text-xs text-[var(--text-secondary)] mt-1">
            Token ID: #{String(tokenId)} • Contract: {formatAddress(nft)}
          </p>
        </div>

        {/* Due Date Stamp or Status Stamp */}
        <div className="text-right">
          {state === ListingState.Rented && (
            <div className="border-2 border-[var(--danger)] text-[var(--danger)] px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider rotate-2 shadow-xs select-none">
              {formatDueStamp(dueAt)}
            </div>
          )}
          {state === ListingState.Available && (
            <div className="border-2 border-[var(--success)] text-[var(--success)] px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider select-none">
              AVAILABLE
            </div>
          )}
          {state === ListingState.Settled && (
            <div className="border-2 border-[var(--border-strong)] text-[var(--text-secondary)] px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider line-through select-none">
              FORFEITED
            </div>
          )}
          {state === ListingState.Delisted && (
            <div className="border-2 border-[var(--border-strong)] text-[var(--text-secondary)] px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider select-none">
              DELISTED
            </div>
          )}
        </div>
      </div>

      {/* Main Slip Body */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Token Artwork (4 cols) */}
        <div className="md:col-span-5 flex flex-col gap-3">
          <div className="w-full aspect-square rounded-sm bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center overflow-hidden">
            {metadata.imageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={metadata.imageSrc}
                alt={tokenName}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-4 text-center">
                <span className="font-serif text-3xl text-[var(--accent)] select-none">
                  §
                </span>
                <span className="font-mono text-[11px] text-[var(--text-secondary)] mt-2">
                  No Data-URI Art
                </span>
              </div>
            )}
          </div>

          <div className="font-mono text-[11px] text-[var(--text-secondary)] flex flex-col gap-1 border-t border-[var(--border-subtle)] pt-2">
            <div>
              <span>Lender: </span>
              <span className="text-[var(--text-primary)] font-bold">
                {formatAddress(lender)}
              </span>
              {isLender && <span className="text-[var(--accent)]"> (You)</span>}
            </div>
            {state === ListingState.Rented && (
              <div>
                <span>Renter: </span>
                <span className="text-[var(--text-primary)] font-bold">
                  {formatAddress(renter)}
                </span>
                {isRenter && <span className="text-[var(--accent)]"> (You)</span>}
              </div>
            )}
          </div>
        </div>

        {/* Pricing Terms & Action Desk (7 cols) */}
        <div className="md:col-span-7 flex flex-col gap-4">
          <div className="bg-[var(--bg-elevated)] p-4 rounded-sm border border-[var(--border-subtle)] flex flex-col gap-2 font-mono text-xs">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-secondary)]">Daily Fee:</span>
              <span className="font-bold text-[var(--text-primary)]">
                {formatBot(pricePerDay)} BOT / day
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-secondary)]">Security Deposit:</span>
              <span className="font-bold text-[var(--text-primary)]">
                {formatBot(deposit)} BOT (refunded on return)
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-secondary)]">Max Duration:</span>
              <span className="font-bold text-[var(--text-primary)]">
                {maxDays} days
              </span>
            </div>
          </div>

          {/* Actions based on role and state */}

          {/* 1. Borrower Rent Form */}
          {state === ListingState.Available && !isLender && (
            <form onSubmit={handleRentSubmit} className="flex flex-col gap-3 pt-2">
              <div>
                <div className="flex justify-between items-center font-mono text-xs mb-1">
                  <label htmlFor="borrow-days" className="text-[var(--text-secondary)]">
                    Borrow Duration:
                  </label>
                  <span className="font-bold text-[var(--accent)]">
                    {rentalDays} {rentalDays === 1 ? "day" : "days"}
                  </span>
                </div>
                <input
                  id="borrow-days"
                  type="range"
                  min="1"
                  max={maxDays}
                  value={rentalDays}
                  onChange={(e) => setRentalDays(Number(e.target.value))}
                  className="w-full cursor-pointer accent-[var(--accent)]"
                />
              </div>

              <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xs font-mono text-xs flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Total Due:</span>
                <span className="font-bold text-sm text-[var(--accent)]">
                  {formatBot(totalCostWei)} BOT
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={isActionPending}
                className="w-full py-2.5"
              >
                {isActionPending ? "Renting..." : "Rent This Token →"}
              </Button>
            </form>
          )}

          {/* 2. Renter Return Controls */}
          {isRenter && (phase === "rented" || phase === "overdue") && (
            <div className="flex flex-col gap-3 pt-2">
              <div className="p-3 rounded-xs border border-[var(--warning)] bg-[var(--warning-muted)] font-mono text-xs">
                {phase === "overdue" ? (
                  <p className="text-[var(--danger)] font-bold">
                    ⚠️ Token is overdue! The 24-hour grace period is ticking. Return immediately to reclaim your {formatBot(deposit)} BOT deposit.
                  </p>
                ) : (
                  <p className="text-[var(--text-primary)]">
                    ℹ Return before the due date to receive your {formatBot(deposit)} BOT security deposit back.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {!approval.isApproved ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onApproveReturn}
                    disabled={isActionPending}
                    className="w-full"
                  >
                    {isActionPending ? "Approving..." : "Step 1: Approve Token Return"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={onReturn}
                    disabled={isActionPending}
                    className="w-full"
                  >
                    {isActionPending ? "Returning..." : "Step 2: Return Token & Get Deposit"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 3. Lender Delist / Claim Controls */}
          {isLender && state === ListingState.Available && (
            <div className="pt-2">
              <p className="text-xs font-serif text-[var(--text-secondary)] mb-3">
                This token is currently available in the library. You may reclaim it from escrow.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={onDelist}
                disabled={isActionPending}
                className="w-full"
              >
                {isActionPending ? "Delisting..." : "Delist & Reclaim Token"}
              </Button>
            </div>
          )}

          {isLender && phase === "forfeitable" && (
            <div className="pt-2 flex flex-col gap-2">
              <p className="text-xs font-serif text-[var(--danger)] font-bold">
                Renter failed to return token before the grace period ended. You are entitled to keep the full deposit and rental fee.
              </p>
              <Button
                type="button"
                variant="danger"
                onClick={onClaim}
                disabled={isActionPending}
                className="w-full"
              >
                {isActionPending ? "Claiming..." : `Claim Deposit (${formatBot(held)} BOT)`}
              </Button>
            </div>
          )}

          {isLender && phase === "overdue" && (
            <div className="pt-2 text-xs font-serif text-[var(--text-secondary)] p-3 bg-[var(--bg-surface)] border border-[var(--border-default)]">
              Token is overdue, but currently in the 24-hour grace period. If the renter does not return it, you can claim the deposit once grace expires.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
