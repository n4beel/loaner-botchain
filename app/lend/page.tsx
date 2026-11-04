"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress, type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { LoanerNotice } from "@/components/loaner/LoanerNotice";
import { useLoanerDeployment, useLoanerActions } from "@/lib/useLoaner";
import { activeBotChain } from "@/lib/botchain/chain";
import { erc721Abi } from "@/lib/botchain/abi";
import { parseNativeAmount } from "@/lib/botchain/amount";
import { DEFAULT_NFT_ADDRESS, ZERO_ADDRESS } from "@/lib/botchain/deployment";

export default function LendTokenPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const deployment = useLoanerDeployment();
  const publicClient = usePublicClient({ chainId: activeBotChain.id }); // stable-hook-result

  const { listToken, approveToken, isPending, txError, clearTxError } = useLoanerActions();

  const [nftAddress, setNftAddress] = useState<string>(
    DEFAULT_NFT_ADDRESS !== ZERO_ADDRESS ? DEFAULT_NFT_ADDRESS : ""
  );
  const [tokenId, setTokenId] = useState<string>("1");
  const [pricePerDay, setPricePerDay] = useState<string>("0.2");
  const [deposit, setDeposit] = useState<string>("1.5");
  const [maxDays, setMaxDays] = useState<number>(14);

  const [formError, setFormError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [checkingToken, setCheckingToken] = useState(false);
  const [isApproved, setIsApproved] = useState<boolean | null>(null);

  const checkTokenStatus = useCallback(async (): Promise<boolean | null> => {
    if (!publicClient || !address || !isAddress(nftAddress) || !tokenId || !deployment.address) return null;
    setCheckingToken(true);
    setFormError(null);
    try {
      const owner = (await publicClient.readContract({
        address: nftAddress as Address,
        abi: erc721Abi,
        functionName: "ownerOf",
        args: [BigInt(tokenId)],
      })) as Address;

      if (owner.toLowerCase() !== address.toLowerCase()) {
        setFormError("You do not hold this token. Current owner is " + owner);
        setIsApproved(null);
        return null;
      }

      const [singleApp, allApp] = await Promise.allSettled([
        publicClient.readContract({
          address: nftAddress as Address,
          abi: erc721Abi,
          functionName: "getApproved",
          args: [BigInt(tokenId)],
        }),
        publicClient.readContract({
          address: nftAddress as Address,
          abi: erc721Abi,
          functionName: "isApprovedForAll",
          args: [address, deployment.address],
        }),
      ]);

      const single = singleApp.status === "fulfilled" ? (singleApp.value as Address) : ZERO_ADDRESS;
      const all = allApp.status === "fulfilled" ? Boolean(allApp.value) : false;
      const approved = all || (single?.toLowerCase() === deployment.address.toLowerCase());
      setIsApproved(approved);
      return approved;
    } catch {
      setFormError("Could not verify token. Confirm the contract is a standard ERC-721 and the token ID exists.");
      setIsApproved(null);
      return null;
    } finally {
      setCheckingToken(false);
    }
  }, [publicClient, address, nftAddress, tokenId, deployment.address]);

  // Check ownership and approval on its own whenever the token or wallet changes, so the form never offers
  // "Deposit" for a token Loaner is not yet approved to hold.
  useEffect(() => {
    setIsApproved(null);
    if (!isConnected || !isAddress(nftAddress) || tokenId === "") return;
    const t = setTimeout(() => {
      void checkTokenStatus();
    }, 300);
    return () => clearTimeout(t);
  }, [isConnected, nftAddress, tokenId, checkTokenStatus]);

  const handleApprove = async () => {
    setFormError(null);
    clearTxError();
    if (!isAddress(nftAddress) || !tokenId) return;
    try {
      await approveToken(nftAddress as Address, BigInt(tokenId));
      const ok = await checkTokenStatus();
      if (ok) setActionSuccess("Token approved. You can deposit it now.");
    } catch {}
  };

  const handleList = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearTxError();

    if (!isConnected || !address) {
      setFormError("Please connect your wallet first.");
      return;
    }

    if (!isAddress(nftAddress)) {
      setFormError("Enter a valid NFT contract address.");
      return;
    }

    if (tokenId === "" || !/^\d+$/.test(tokenId)) {
      setFormError("Token ID must be a whole number.");
      return;
    }

    const tId = BigInt(tokenId);
    const pWei = parseNativeAmount(pricePerDay);
    const dWei = parseNativeAmount(deposit);

    if (!pWei || pWei <= 0n) {
      setFormError("Enter a valid positive price per day in BOT.");
      return;
    }

    if (!dWei || dWei <= 0n) {
      setFormError("Enter a valid positive deposit amount in BOT.");
      return;
    }

    if (maxDays < 1 || maxDays > 90) {
      setFormError("Maximum rental days must be between 1 and 90.");
      return;
    }

    const approved = await checkTokenStatus();
    if (approved !== true) {
      if (approved === false) setFormError("Approve the token first, then deposit.");
      return;
    }

    try {
      await listToken(nftAddress as Address, tId, pWei, dWei, maxDays);
      setActionSuccess("Token listed successfully in the library!");
      setTimeout(() => router.push("/"), 1200);
    } catch {}
  };

  return (
    <PageShell title="Lend a Token" description="Deposit an ERC-721 into library escrow to earn daily rental fees">
      <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full">
        {/* Status Feedback */}
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

        {/* Consequence Banner */}
        <div className="p-4 rounded-xs border border-[#9E7D59] bg-[var(--bg-elevated)] font-serif text-xs leading-relaxed text-[var(--text-primary)]">
          <strong className="block text-sm font-title font-bold text-[var(--text-primary)] mb-1">
            Important Librarian Warning
          </strong>
          The renter holds the real token. The deposit is your only protection; set it at least as high as the token is worth to you.
        </div>

        {/* Listing Form */}
        <Panel archival className="p-6 md:p-8">
          <form onSubmit={handleList} className="flex flex-col gap-5">
            <h2 className="font-title text-lg font-bold border-b border-[var(--border-subtle)] pb-2 text-[var(--text-primary)]">
              Catalogue New Lending Item
            </h2>

            {/* Contract & Token ID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label
                  htmlFor="nft-address"
                  className="block text-[11px] uppercase tracking-wider font-mono text-[var(--text-secondary)] mb-1"
                >
                  ERC-721 Contract Address
                </label>
                <input
                  id="nft-address"
                  type="text"
                  placeholder="0x..."
                  value={nftAddress}
                  onChange={(e) => {
                    setNftAddress(e.target.value);
                    setIsApproved(null);
                  }}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xs border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="token-id"
                  className="block text-[11px] uppercase tracking-wider font-mono text-[var(--text-secondary)] mb-1"
                >
                  Token ID
                </label>
                <input
                  id="token-id"
                  type="number"
                  step="1"
                  min="0"
                  value={tokenId}
                  onChange={(e) => {
                    setTokenId(e.target.value);
                    setIsApproved(null);
                  }}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xs border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none"
                />
              </div>
            </div>

            {/* Check Token ownership button */}
            <div className="flex items-center justify-between text-xs font-mono">
              <button
                type="button"
                onClick={() => void checkTokenStatus()}
                disabled={checkingToken || !isAddress(nftAddress)}
                className="text-[var(--accent)] hover:underline"
              >
                {checkingToken ? "Checking on-chain..." : "Verify Ownership & Approval →"}
              </button>

              {isApproved !== null && (
                <span className={isApproved ? "text-[var(--success)] font-bold" : "text-[var(--warning)] font-bold"}>
                  {isApproved ? "Approved ✓" : "Approval Needed"}
                </span>
              )}
            </div>

            {/* Pricing fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[var(--border-subtle)]">
              <div>
                <label
                  htmlFor="price-day"
                  className="block text-[11px] uppercase tracking-wider font-mono text-[var(--text-secondary)] mb-1"
                >
                  Daily Rate (BOT)
                </label>
                <input
                  id="price-day"
                  type="number"
                  step="any"
                  min="0.001"
                  value={pricePerDay}
                  onChange={(e) => setPricePerDay(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xs border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="deposit-amt"
                  className="block text-[11px] uppercase tracking-wider font-mono text-[var(--text-secondary)] mb-1"
                >
                  Security Deposit (BOT)
                </label>
                <input
                  id="deposit-amt"
                  type="number"
                  step="any"
                  min="0.001"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xs border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="max-days"
                className="block text-[11px] uppercase tracking-wider font-mono text-[var(--text-secondary)] mb-1"
              >
                Maximum Rental Length (1–90 days)
              </label>
              <input
                id="max-days"
                type="number"
                step="1"
                min="1"
                max="90"
                value={maxDays}
                onChange={(e) => setMaxDays(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono rounded-xs border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none"
              />
            </div>

            {formError && (
              <div className="p-3 rounded-xs border border-[var(--danger)] bg-[var(--danger-muted)] text-[var(--danger)] text-xs font-mono">
                {formError}
              </div>
            )}

            {/* Submission buttons */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-end gap-3">
              {isApproved === false ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleApprove}
                  disabled={isPending || checkingToken}
                >
                  {isPending ? "Approving..." : "Step 1: Approve Token"}
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isPending || checkingToken || isApproved !== true}
                >
                  {isPending
                    ? "Escrowing..."
                    : checkingToken
                    ? "Checking token…"
                    : isApproved === true
                    ? "Step 2: Deposit & List on Shelf →"
                    : "Enter a token you hold"}
                </Button>
              )}
            </div>
          </form>
        </Panel>

        <LoanerNotice />
      </div>
    </PageShell>
  );
}
