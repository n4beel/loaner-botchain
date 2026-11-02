"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import { LibraryShelf } from "@/components/loaner/LibraryShelf";
import { LoanSlip } from "@/components/loaner/LoanSlip";
import { LoanerNotice } from "@/components/loaner/LoanerNotice";
import { useShelfListings, useLoanerActions, type DetailedListing } from "@/lib/useLoaner";
import { app } from "@/lib/app-config";

export default function Home() {
  const { address } = useAccount();
  const { listings, loading, error, refresh } = useShelfListings();
  const {
    rentToken,
    giveBackToken,
    claimDeposit,
    delistToken,
    approveToken,
    isPending,
    txError,
    clearTxError,
  } = useLoanerActions();

  const [selectedListing, setSelectedListing] = useState<DetailedListing | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Sort listings: Available first, then Rented with due dates, then Settled/Delisted
  const sortedListings = [...listings].sort((a, b) => {
    if (a.state !== b.state) {
      return a.state - b.state;
    }
    // Secondary sort: earliest due date first for rented tokens
    if (a.state === 1 && b.state === 1) {
      return Number(a.dueAt - b.dueAt);
    }
    return Number(b.id - a.id);
  });

  const handleSelect = (item: DetailedListing) => {
    if (selectedListing?.id === item.id) {
      setSelectedListing(null);
    } else {
      setSelectedListing(item);
    }
  };

  const handleRent = async (days_: number, paymentWei: bigint) => {
    if (!selectedListing) return;
    setActionSuccess(null);
    clearTxError();
    try {
      await rentToken(selectedListing.id, days_, paymentWei);
      setActionSuccess(`Token #${String(selectedListing.tokenId)} rented for ${days_} days!`);
      await refresh();
      setSelectedListing(null);
    } catch {}
  };

  const handleReturn = async () => {
    if (!selectedListing) return;
    setActionSuccess(null);
    clearTxError();
    try {
      await giveBackToken(selectedListing.id);
      setActionSuccess(`Token returned to library! Deposit refunded to your pending balance.`);
      await refresh();
      setSelectedListing(null);
    } catch {}
  };

  const handleApproveReturn = async () => {
    if (!selectedListing) return;
    setActionSuccess(null);
    clearTxError();
    try {
      await approveToken(selectedListing.nft, selectedListing.tokenId);
      setActionSuccess("Token approved for return.");
      await refresh();
    } catch {}
  };

  const handleClaim = async () => {
    if (!selectedListing) return;
    setActionSuccess(null);
    clearTxError();
    try {
      await claimDeposit(selectedListing.id);
      setActionSuccess("Deposit and fee claimed to your pending balance!");
      await refresh();
      setSelectedListing(null);
    } catch {}
  };

  const handleDelist = async () => {
    if (!selectedListing) return;
    setActionSuccess(null);
    clearTxError();
    try {
      await delistToken(selectedListing.id);
      setActionSuccess("Token delisted and returned to your wallet.");
      await refresh();
      setSelectedListing(null);
    } catch {}
  };

  return (
    <PageShell title="The Library Shelf" description={app.tagline}>
      <div className="flex flex-col gap-8">
        {/* Action Status Feedback */}
        {actionSuccess && (
          <div className="p-3.5 rounded-xs border border-[var(--success)] bg-[var(--success-muted)] text-[var(--success)] text-xs font-mono flex items-center justify-between">
            <span>✓ {actionSuccess}</span>
            <button
              type="button"
              onClick={() => setActionSuccess(null)}
              className="text-xs hover:underline ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {txError && (
          <div className="p-3.5 rounded-xs border border-[var(--danger)] bg-[var(--danger-muted)] text-[var(--danger)] text-xs font-mono flex items-center justify-between">
            <span>⚠ {txError}</span>
            <button
              type="button"
              onClick={clearTxError}
              className="text-xs hover:underline ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Shelf Overview Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-2 text-xs font-serif">
          <div>
            <span className="font-bold text-[var(--text-primary)]">
              Archival Stacks
            </span>{" "}
            <span className="text-[var(--text-secondary)]">
              (Available items first • Pull a spine to inspect loan slip)
            </span>
          </div>

          <div className="font-mono text-[11px] text-[var(--text-tertiary)]">
            {listings.length} catalogue items
          </div>
        </div>

        {/* The Bookshelf */}
        <LibraryShelf
          listings={sortedListings}
          selectedListing={selectedListing}
          onSelectListing={handleSelect}
          loading={loading}
        />

        {/* Pulled Loan Slip Tray */}
        {selectedListing && (
          <section className="flex flex-col gap-3 pt-4 border-t border-[var(--border-default)]">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[var(--accent)] font-bold">
                ↓ Pulled Slip for §{String(selectedListing.id)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedListing(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
              >
                Close Slip ×
              </button>
            </div>

            <LoanSlip
              listing={selectedListing}
              currentUser={address}
              onRent={handleRent}
              onReturn={handleReturn}
              onClaim={handleClaim}
              onDelist={handleDelist}
              onApproveReturn={handleApproveReturn}
              isActionPending={isPending}
            />
          </section>
        )}

        {/* Operational Limits Notice */}
        <LoanerNotice />
      </div>
    </PageShell>
  );
}
