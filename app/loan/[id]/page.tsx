"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import { LoanSlip } from "@/components/loaner/LoanSlip";
import { LoanerNotice } from "@/components/loaner/LoanerNotice";
import { useListingDetail, useLoanerActions } from "@/lib/useLoaner";
import { app } from "@/lib/app-config";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function SingleLoanPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const rawId = resolvedParams.id;
  const validId = !isNaN(Number(rawId)) && Number(rawId) > 0;
  const listingId = validId ? BigInt(rawId) : undefined;

  const { address } = useAccount();
  const { listing, loading, error, refresh } = useListingDetail(listingId);
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

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  if (!validId || !listingId) {
    return (
      <PageShell title="Catalogue Record Not Found" description={app.tagline}>
        <Panel archival className="p-8 text-center max-w-lg mx-auto">
          <h2 className="text-lg font-bold font-title text-[var(--danger)]">
            Invalid Identifier
          </h2>
          <p className="mt-2 text-xs font-mono text-[var(--text-secondary)]">
            The catalogue record ID must be a positive integer.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-block px-4 py-2 rounded-xs text-xs font-serif bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)]"
            >
              ← Return to Library Shelves
            </Link>
          </div>
        </Panel>
      </PageShell>
    );
  }

  const handleRent = async (days_: number, paymentWei: bigint) => {
    setActionSuccess(null);
    clearTxError();
    try {
      await rentToken(listingId, days_, paymentWei);
      setActionSuccess(`Token rented for ${days_} days!`);
      await refresh();
    } catch {}
  };

  const handleReturn = async () => {
    setActionSuccess(null);
    clearTxError();
    try {
      await giveBackToken(listingId);
      setActionSuccess("Token returned to library! Deposit refunded to your pending balance.");
      await refresh();
    } catch {}
  };

  const handleApproveReturn = async () => {
    if (!listing) return;
    setActionSuccess(null);
    clearTxError();
    try {
      await approveToken(listing.nft, listing.tokenId);
      setActionSuccess("Token approved for return.");
      await refresh();
    } catch {}
  };

  const handleClaim = async () => {
    setActionSuccess(null);
    clearTxError();
    try {
      await claimDeposit(listingId);
      setActionSuccess("Deposit and fee claimed to your pending balance!");
      await refresh();
    } catch {}
  };

  const handleDelist = async () => {
    setActionSuccess(null);
    clearTxError();
    try {
      await delistToken(listingId);
      setActionSuccess("Token delisted and returned to your wallet.");
      await refresh();
    } catch {}
  };

  return (
    <PageShell title={`Catalogue Slip §${String(listingId)}`} description="Official Library Lending Record">
      <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between text-xs font-serif">
          <Link
            href="/"
            className="text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
          >
            ← Back to Library Shelves
          </Link>
          <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
            Record ID: #{String(listingId)}
          </span>
        </div>

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

        {loading ? (
          <div className="p-16 text-center font-serif text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xs">
            Retrieving catalogue slip from library archives...
          </div>
        ) : error || !listing ? (
          <Panel archival className="p-8 text-center">
            <h3 className="font-title text-base font-bold text-[var(--danger)]">
              Catalogue Slip Missing
            </h3>
            <p className="mt-2 text-xs font-mono text-[var(--text-secondary)]">
              {error || "This listing does not exist in the loaner archives."}
            </p>
            <div className="mt-4">
              <Link
                href="/"
                className="inline-block px-4 py-2 rounded-xs text-xs font-serif bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--text-primary)]"
              >
                Return Home
              </Link>
            </div>
          </Panel>
        ) : (
          <LoanSlip
            listing={listing}
            currentUser={address}
            onRent={handleRent}
            onReturn={handleReturn}
            onClaim={handleClaim}
            onDelist={handleDelist}
            onApproveReturn={handleApproveReturn}
            isActionPending={isPending}
          />
        )}

        <LoanerNotice />
      </div>
    </PageShell>
  );
}
