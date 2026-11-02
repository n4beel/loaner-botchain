"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { formatAddress, formatBot, formatDueStamp } from "@/lib/loaner";
import { useUserLoanerDesk, useLoanerActions } from "@/lib/useLoaner";
import { LoanerNotice } from "@/components/loaner/LoanerNotice";

export default function UserLoanerDeskPage() {
  const { address, isConnected } = useAccount();
  const { lentListings, rentedListings, pending, loading, refresh } = useUserLoanerDesk(address);
  const {
    withdrawPending,
    giveBackToken,
    claimDeposit,
    delistToken,
    approveToken,
    isPending,
    txError,
    clearTxError,
  } = useLoanerActions();

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleWithdraw = async () => {
    setActionSuccess(null);
    clearTxError();
    try {
      await withdrawPending();
      setActionSuccess("Pending balance withdrawn successfully to your wallet!");
      await refresh();
    } catch {}
  };

  const handleReturn = async (id: bigint) => {
    setActionSuccess(null);
    clearTxError();
    try {
      await giveBackToken(id);
      setActionSuccess(`Token returned! Security deposit credited to your pending balance.`);
      await refresh();
    } catch {}
  };

  const handleApproveReturn = async (nft: `0x${string}`, tokenId: bigint) => {
    setActionSuccess(null);
    clearTxError();
    try {
      await approveToken(nft, tokenId);
      setActionSuccess(`Token #${String(tokenId)} approved for return.`);
      await refresh();
    } catch {}
  };

  const handleClaim = async (id: bigint) => {
    setActionSuccess(null);
    clearTxError();
    try {
      await claimDeposit(id);
      setActionSuccess(`Deposit and fee claimed to your pending balance!`);
      await refresh();
    } catch {}
  };

  const handleDelist = async (id: bigint) => {
    setActionSuccess(null);
    clearTxError();
    try {
      await delistToken(id);
      setActionSuccess(`Token delisted and returned to your wallet.`);
      await refresh();
    } catch {}
  };

  return (
    <PageShell title="My Library Desk" description="Manage your catalogued loans, borrowed tokens, and claimable balances">
      <div className="flex flex-col gap-6">
        {/* Wallet connection prompt */}
        {!isConnected && (
          <Panel archival className="p-6 text-center">
            <h3 className="font-title text-base font-bold text-[var(--accent)]">
              Library Card Required
            </h3>
            <p className="mt-1 text-xs font-serif text-[var(--text-secondary)]">
              Please connect your wallet via the top right corner to view your personal library records.
            </p>
          </Panel>
        )}

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

        {/* Pending Escrow Balance Pane */}
        <Panel archival className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-secondary)] block">
                Claimable Escrow Balance
              </span>
              <div className="font-mono text-2xl font-bold text-[var(--accent)] mt-1">
                {pending !== null ? formatBot(pending) : "0.000"} BOT
              </div>
              <p className="mt-1 text-xs font-serif text-[var(--text-secondary)]">
                Includes rental fees earned from borrowers and refunded deposits from returned loans.
              </p>
            </div>

            <Button
              type="button"
              variant="primary"
              onClick={handleWithdraw}
              disabled={isPending || !pending || pending === 0n}
            >
              {isPending ? "Withdrawing..." : "Withdraw Balance"}
            </Button>
          </div>
        </Panel>

        {/* Section 1: Tokens You've Borrowed */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
            <h3 className="font-title text-base font-bold text-[var(--text-primary)]">
              Tokens You&apos;ve Borrowed ({rentedListings.length})
            </h3>
            <span className="font-mono text-[11px] text-[var(--text-secondary)]">
              Renter positions
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center font-serif text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xs">
              Scanning your borrowed loans...
            </div>
          ) : rentedListings.length === 0 ? (
            <Panel archival className="p-6 text-center text-xs font-serif text-[var(--text-secondary)]">
              You do not currently have any active borrowed tokens.
            </Panel>
          ) : (
            <div className="flex flex-col gap-2">
              {rentedListings.map((item) => (
                <div
                  key={String(item.id)}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xs bg-[var(--bg-surface)] border border-[var(--border-default)]"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-7 h-7 rounded-xs flex items-center justify-center font-mono text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: item.shelfStyle.bg }}
                    >
                      §{String(item.id)}
                    </span>
                    <div>
                      <Link
                        href={`/loan/${String(item.id)}`}
                        className="font-title text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                      >
                        {item.tokenName}
                      </Link>
                      <p className="font-mono text-[10px] text-[var(--text-secondary)]">
                        NFT: {formatAddress(item.nft)} • Lender: {formatAddress(item.lender)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-mono text-xs font-bold text-[var(--danger)]">
                        {formatDueStamp(item.dueAt)}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--text-secondary)]">
                        Deposit: {formatBot(item.deposit)} BOT
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!item.approval.isApproved ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleApproveReturn(item.nft, item.tokenId)}
                          disabled={isPending}
                        >
                          Step 1: Approve
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => handleReturn(item.id)}
                          disabled={isPending}
                        >
                          Step 2: Return
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Tokens You've Lent */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
            <h3 className="font-title text-base font-bold text-[var(--text-primary)]">
              Tokens You&apos;ve Lent ({lentListings.length})
            </h3>
            <span className="font-mono text-[11px] text-[var(--text-secondary)]">
              Lender positions
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center font-serif text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xs">
              Scanning your catalogued tokens...
            </div>
          ) : lentListings.length === 0 ? (
            <Panel archival className="p-6 text-center text-xs font-serif text-[var(--text-secondary)]">
              You haven&apos;t catalogued any tokens for lending yet.
            </Panel>
          ) : (
            <div className="flex flex-col gap-2">
              {lentListings.map((item) => (
                <div
                  key={String(item.id)}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xs bg-[var(--bg-surface)] border border-[var(--border-default)]"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-7 h-7 rounded-xs flex items-center justify-center font-mono text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: item.shelfStyle.bg }}
                    >
                      §{String(item.id)}
                    </span>
                    <div>
                      <Link
                        href={`/loan/${String(item.id)}`}
                        className="font-title text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                      >
                        {item.tokenName}
                      </Link>
                      <p className="font-mono text-[10px] text-[var(--text-secondary)]">
                        NFT: {formatAddress(item.nft)} • ID #{String(item.tokenId)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="inline-block px-1.5 py-0.5 rounded-xs text-[9px] font-mono uppercase font-bold border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                        {item.phase}
                      </span>
                      <div className="font-mono text-[10px] text-[var(--text-primary)] mt-0.5">
                        {formatBot(item.pricePerDay)} BOT/day
                      </div>
                    </div>

                    <div>
                      {item.state === 0 && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDelist(item.id)}
                          disabled={isPending}
                        >
                          Delist
                        </Button>
                      )}
                      {item.phase === "forfeitable" && (
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => handleClaim(item.id)}
                          disabled={isPending}
                        >
                          Claim Deposit
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <LoanerNotice />
      </div>
    </PageShell>
  );
}
