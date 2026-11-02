"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient, useAccount } from "wagmi";
import type { Address } from "viem";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment, ZERO_ADDRESS } from "@/lib/botchain/deployment";
import { loanerAbi, erc721Abi } from "@/lib/botchain/abi";
import { useWriteContract, waitSuccess } from "@/lib/useChainWrite";
import { decodeContractError } from "@/lib/errors";
import {
  shelfColour,
  phase,
  approvalState,
  decodeDataUri,
  ListingState,
  type ListingData,
  type RentalPhase,
  type ApprovalStatus,
  type DecodedMetadata,
} from "@/lib/loaner";

export function useLoanerDeployment() {
  return getDeployment(activeBotChain.id);
}

export interface DetailedListing extends ListingData {
  phase: RentalPhase;
  tokenName: string;
  tokenSymbol: string;
  metadata: DecodedMetadata;
  shelfStyle: { bg: string; fg: string; name: string };
  tokenOwner: Address | null;
  approval: ApprovalStatus;
}

export function useShelfListings() {
  const deployment = useLoanerDeployment();
  const publicClient = usePublicClient({ chainId: activeBotChain.id }); // stable-hook-result
  const [listings, setListings] = useState<DetailedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchShelf = useCallback(async () => {
    if (
      !publicClient ||
      !deployment.address ||
      deployment.address === ZERO_ADDRESS
    ) {
      setListings([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const totalCount = (await publicClient.readContract({
        address: deployment.address,
        abi: loanerAbi,
        functionName: "listingCount",
      })) as bigint;

      if (totalCount === 0n) {
        setListings([]);
        return;
      }

      const countToFetch = totalCount > 50n ? 50n : totalCount;
      const rawListings = (await publicClient.readContract({
        address: deployment.address,
        abi: loanerAbi,
        functionName: "latest",
        args: [0n, countToFetch],
      })) as any[];

      const nowSec = Math.floor(Date.now() / 1000);
      const parsed: DetailedListing[] = [];

      for (let i = 0; i < rawListings.length; i++) {
        const item = rawListings[i];
        const id = totalCount - BigInt(i);
        const lender = (item.lender ?? item[0]) as Address;
        const nft = (item.nft ?? item[1]) as Address;
        const tokenId = BigInt(item.tokenId ?? item[2] ?? 0);
        const pricePerDay = BigInt(item.pricePerDay ?? item[3] ?? 0);
        const deposit = BigInt(item.deposit ?? item[4] ?? 0);
        const maxDays = Number(item.maxDays ?? item[5] ?? 0);
        const state = Number(item.state ?? item[6] ?? 0) as ListingState;
        const renter = (item.renter ?? item[7]) as Address;
        const dueAt = BigInt(item.dueAt ?? item[8] ?? 0);
        const held = BigInt(item.held ?? item[9] ?? 0);

        const listData: ListingData = {
          id,
          lender,
          nft,
          tokenId,
          pricePerDay,
          deposit,
          maxDays,
          state,
          renter,
          dueAt,
          held,
        };

        const currentPhase = phase(listData, nowSec);
        const shelfStyle = shelfColour(nft);

        let tokenUri = "";
        let tokenName = "";
        let tokenSymbol = "";
        let tokenOwner: Address | null = null;
        let isApprovedAll = false;
        let approvedSingle: Address = ZERO_ADDRESS;

        try {
          const [uriRes, nameRes, symRes, ownerRes] = await Promise.allSettled([
            publicClient.readContract({
              address: nft,
              abi: erc721Abi,
              functionName: "tokenURI",
              args: [tokenId],
            }),
            publicClient.readContract({
              address: nft,
              abi: erc721Abi,
              functionName: "name",
            }),
            publicClient.readContract({
              address: nft,
              abi: erc721Abi,
              functionName: "symbol",
            }),
            publicClient.readContract({
              address: nft,
              abi: erc721Abi,
              functionName: "ownerOf",
              args: [tokenId],
            }),
          ]);

          if (uriRes.status === "fulfilled") tokenUri = uriRes.value as string;
          if (nameRes.status === "fulfilled") tokenName = nameRes.value as string;
          if (symRes.status === "fulfilled") tokenSymbol = symRes.value as string;
          if (ownerRes.status === "fulfilled") tokenOwner = ownerRes.value as Address;

          if (renter && renter !== ZERO_ADDRESS) {
            const [singleApp, allApp] = await Promise.allSettled([
              publicClient.readContract({
                address: nft,
                abi: erc721Abi,
                functionName: "getApproved",
                args: [tokenId],
              }),
              publicClient.readContract({
                address: nft,
                abi: erc721Abi,
                functionName: "isApprovedForAll",
                args: [renter, deployment.address],
              }),
            ]);
            if (singleApp.status === "fulfilled") approvedSingle = singleApp.value as Address;
            if (allApp.status === "fulfilled") isApprovedAll = Boolean(allApp.value);
          }
        } catch {
          // Non-critical token query fallback
        }

        const metadata = decodeDataUri(tokenUri);
        const approval = approvalState(deployment.address, isApprovedAll, approvedSingle);

        parsed.push({
          ...listData,
          phase: currentPhase,
          tokenName: tokenName || metadata.name || `Token #${String(tokenId)}`,
          tokenSymbol: tokenSymbol || "ERC-721",
          metadata,
          shelfStyle,
          tokenOwner,
          approval,
        });
      }

      setListings(parsed);
    } catch (err) {
      setError(decodeContractError(err));
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [publicClient, deployment.address]);

  useEffect(() => {
    fetchShelf();
  }, [fetchShelf]); // stable-hook-result

  return { listings, loading, error, refresh: fetchShelf };
}

export function useListingDetail(id?: bigint) {
  const deployment = useLoanerDeployment();
  const publicClient = usePublicClient({ chainId: activeBotChain.id }); // stable-hook-result
  const [listing, setListing] = useState<DetailedListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (
      !publicClient ||
      !deployment.address ||
      deployment.address === ZERO_ADDRESS ||
      !id ||
      id <= 0n
    ) {
      setListing(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const raw = (await publicClient.readContract({
        address: deployment.address,
        abi: loanerAbi,
        functionName: "listingOf",
        args: [id],
      })) as any;

      const lender = (raw.lender ?? raw[0]) as Address;
      const nft = (raw.nft ?? raw[1]) as Address;
      const tokenId = BigInt(raw.tokenId ?? raw[2] ?? 0);
      const pricePerDay = BigInt(raw.pricePerDay ?? raw[3] ?? 0);
      const deposit = BigInt(raw.deposit ?? raw[4] ?? 0);
      const maxDays = Number(raw.maxDays ?? raw[5] ?? 0);
      const state = Number(raw.state ?? raw[6] ?? 0) as ListingState;
      const renter = (raw.renter ?? raw[7]) as Address;
      const dueAt = BigInt(raw.dueAt ?? raw[8] ?? 0);
      const held = BigInt(raw.held ?? raw[9] ?? 0);

      const listData: ListingData = {
        id,
        lender,
        nft,
        tokenId,
        pricePerDay,
        deposit,
        maxDays,
        state,
        renter,
        dueAt,
        held,
      };

      const nowSec = Math.floor(Date.now() / 1000);
      const currentPhase = phase(listData, nowSec);
      const shelfStyle = shelfColour(nft);

      let tokenUri = "";
      let tokenName = "";
      let tokenSymbol = "";
      let tokenOwner: Address | null = null;
      let isApprovedAll = false;
      let approvedSingle: Address = ZERO_ADDRESS;

      try {
        const [uriRes, nameRes, symRes, ownerRes] = await Promise.allSettled([
          publicClient.readContract({
            address: nft,
            abi: erc721Abi,
            functionName: "tokenURI",
            args: [tokenId],
          }),
          publicClient.readContract({
            address: nft,
            abi: erc721Abi,
            functionName: "name",
          }),
          publicClient.readContract({
            address: nft,
            abi: erc721Abi,
            functionName: "symbol",
          }),
          publicClient.readContract({
            address: nft,
            abi: erc721Abi,
            functionName: "ownerOf",
            args: [tokenId],
          }),
        ]);

        if (uriRes.status === "fulfilled") tokenUri = uriRes.value as string;
        if (nameRes.status === "fulfilled") tokenName = nameRes.value as string;
        if (symRes.status === "fulfilled") tokenSymbol = symRes.value as string;
        if (ownerRes.status === "fulfilled") tokenOwner = ownerRes.value as Address;

        const effectiveRenter = renter && renter !== ZERO_ADDRESS ? renter : lender;
        const [singleApp, allApp] = await Promise.allSettled([
          publicClient.readContract({
            address: nft,
            abi: erc721Abi,
            functionName: "getApproved",
            args: [tokenId],
          }),
          publicClient.readContract({
            address: nft,
            abi: erc721Abi,
            functionName: "isApprovedForAll",
            args: [effectiveRenter, deployment.address],
          }),
        ]);
        if (singleApp.status === "fulfilled") approvedSingle = singleApp.value as Address;
        if (allApp.status === "fulfilled") isApprovedAll = Boolean(allApp.value);
      } catch {
        // Non-critical metadata read error
      }

      const metadata = decodeDataUri(tokenUri);
      const approval = approvalState(deployment.address, isApprovedAll, approvedSingle);

      setListing({
        ...listData,
        phase: currentPhase,
        tokenName: tokenName || metadata.name || `Token #${String(tokenId)}`,
        tokenSymbol: tokenSymbol || "ERC-721",
        metadata,
        shelfStyle,
        tokenOwner,
        approval,
      });
    } catch (err) {
      setError(decodeContractError(err));
      setListing(null);
    } finally {
      setLoading(false);
    }
  }, [publicClient, deployment.address, id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]); // stable-hook-result

  return { listing, loading, error, refresh: fetchDetail };
}

export function useUserLoanerDesk(userAddress?: Address) {
  const deployment = useLoanerDeployment();
  const publicClient = usePublicClient({ chainId: activeBotChain.id }); // stable-hook-result
  const [lentListings, setLentListings] = useState<DetailedListing[]>([]);
  const [rentedListings, setRentedListings] = useState<DetailedListing[]>([]);
  const [pending, setPending] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDesk = useCallback(async () => {
    if (
      !publicClient ||
      !deployment.address ||
      deployment.address === ZERO_ADDRESS ||
      !userAddress
    ) {
      setLentListings([]);
      setRentedListings([]);
      setPending(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [pendingRes, countRes] = await Promise.all([
        publicClient.readContract({
          address: deployment.address,
          abi: loanerAbi,
          functionName: "pending",
          args: [userAddress],
        }),
        publicClient.readContract({
          address: deployment.address,
          abi: loanerAbi,
          functionName: "listingCount",
        }),
      ]);

      setPending(pendingRes as bigint);

      const totalCount = countRes as bigint;
      if (totalCount === 0n) {
        setLentListings([]);
        setRentedListings([]);
        return;
      }

      const countToFetch = totalCount > 50n ? 50n : totalCount;
      const rawListings = (await publicClient.readContract({
        address: deployment.address,
        abi: loanerAbi,
        functionName: "latest",
        args: [0n, countToFetch],
      })) as any[];

      const nowSec = Math.floor(Date.now() / 1000);
      const userLent: DetailedListing[] = [];
      const userRented: DetailedListing[] = [];

      for (let i = 0; i < rawListings.length; i++) {
        const item = rawListings[i];
        const id = totalCount - BigInt(i);
        const lender = (item.lender ?? item[0]) as Address;
        const nft = (item.nft ?? item[1]) as Address;
        const tokenId = BigInt(item.tokenId ?? item[2] ?? 0);
        const pricePerDay = BigInt(item.pricePerDay ?? item[3] ?? 0);
        const deposit = BigInt(item.deposit ?? item[4] ?? 0);
        const maxDays = Number(item.maxDays ?? item[5] ?? 0);
        const state = Number(item.state ?? item[6] ?? 0) as ListingState;
        const renter = (item.renter ?? item[7]) as Address;
        const dueAt = BigInt(item.dueAt ?? item[8] ?? 0);
        const held = BigInt(item.held ?? item[9] ?? 0);

        const isUserLender = lender.toLowerCase() === userAddress.toLowerCase();
        const isUserRenter = renter.toLowerCase() === userAddress.toLowerCase() && state === ListingState.Rented;

        if (isUserLender || isUserRenter) {
          const listData: ListingData = {
            id,
            lender,
            nft,
            tokenId,
            pricePerDay,
            deposit,
            maxDays,
            state,
            renter,
            dueAt,
            held,
          };
          const currentPhase = phase(listData, nowSec);
          const shelfStyle = shelfColour(nft);

          let tokenName = "";
          let tokenSymbol = "";
          let isApprovedAll = false;
          let approvedSingle: Address = ZERO_ADDRESS;

          try {
            const [nameRes, symRes, singleApp, allApp] = await Promise.allSettled([
              publicClient.readContract({ address: nft, abi: erc721Abi, functionName: "name" }),
              publicClient.readContract({ address: nft, abi: erc721Abi, functionName: "symbol" }),
              publicClient.readContract({ address: nft, abi: erc721Abi, functionName: "getApproved", args: [tokenId] }),
              publicClient.readContract({ address: nft, abi: erc721Abi, functionName: "isApprovedForAll", args: [userAddress, deployment.address] }),
            ]);
            if (nameRes.status === "fulfilled") tokenName = nameRes.value as string;
            if (symRes.status === "fulfilled") tokenSymbol = symRes.value as string;
            if (singleApp.status === "fulfilled") approvedSingle = singleApp.value as Address;
            if (allApp.status === "fulfilled") isApprovedAll = Boolean(allApp.value);
          } catch {}

          const detailed: DetailedListing = {
            ...listData,
            phase: currentPhase,
            tokenName: tokenName || `Token #${String(tokenId)}`,
            tokenSymbol: tokenSymbol || "ERC-721",
            metadata: { name: "", description: "", imageSrc: null },
            shelfStyle,
            tokenOwner: null,
            approval: approvalState(deployment.address, isApprovedAll, approvedSingle),
          };

          if (isUserLender) userLent.push(detailed);
          if (isUserRenter) userRented.push(detailed);
        }
      }

      setLentListings(userLent);
      setRentedListings(userRented);
    } catch (err) {
      setError(decodeContractError(err));
    } finally {
      setLoading(false);
    }
  }, [publicClient, deployment.address, userAddress]);

  useEffect(() => {
    fetchDesk();
  }, [fetchDesk]); // stable-hook-result

  return { lentListings, rentedListings, pending, loading, error, refresh: fetchDesk };
}

export function useLoanerActions() {
  const deployment = useLoanerDeployment();
  const publicClient = usePublicClient({ chainId: activeBotChain.id }); // stable-hook-result
  const { writeContractAsync } = useWriteContract();
  const [isPending, setIsPending] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const listToken = useCallback(
    async (
      nft: Address,
      tokenId: bigint,
      pricePerDay: bigint,
      deposit: bigint,
      maxDays: number
    ) => {
      if (!publicClient || !deployment.address) throw new Error("Contract not ready");
      setIsPending(true);
      setTxError(null);
      try {
        const hash = await writeContractAsync({
          address: deployment.address,
          abi: loanerAbi,
          functionName: "list",
          args: [nft, tokenId, pricePerDay, deposit, maxDays],
        });
        const receipt = await waitSuccess(publicClient, hash);
        return receipt;
      } catch (err) {
        const msg = decodeContractError(err);
        setTxError(msg);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [publicClient, deployment.address, writeContractAsync]
  );

  const rentToken = useCallback(
    async (id: bigint, days_: number, paymentWei: bigint) => {
      if (!publicClient || !deployment.address) throw new Error("Contract not ready");
      setIsPending(true);
      setTxError(null);
      try {
        const hash = await writeContractAsync({
          address: deployment.address,
          abi: loanerAbi,
          functionName: "rent",
          args: [id, days_],
          value: paymentWei,
        });
        const receipt = await waitSuccess(publicClient, hash);
        return receipt;
      } catch (err) {
        const msg = decodeContractError(err);
        setTxError(msg);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [publicClient, deployment.address, writeContractAsync]
  );

  const giveBackToken = useCallback(
    async (id: bigint) => {
      if (!publicClient || !deployment.address) throw new Error("Contract not ready");
      setIsPending(true);
      setTxError(null);
      try {
        const hash = await writeContractAsync({
          address: deployment.address,
          abi: loanerAbi,
          functionName: "giveBack",
          args: [id],
        });
        const receipt = await waitSuccess(publicClient, hash);
        return receipt;
      } catch (err) {
        const msg = decodeContractError(err);
        setTxError(msg);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [publicClient, deployment.address, writeContractAsync]
  );

  const claimDeposit = useCallback(
    async (id: bigint) => {
      if (!publicClient || !deployment.address) throw new Error("Contract not ready");
      setIsPending(true);
      setTxError(null);
      try {
        const hash = await writeContractAsync({
          address: deployment.address,
          abi: loanerAbi,
          functionName: "claimDeposit",
          args: [id],
        });
        const receipt = await waitSuccess(publicClient, hash);
        return receipt;
      } catch (err) {
        const msg = decodeContractError(err);
        setTxError(msg);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [publicClient, deployment.address, writeContractAsync]
  );

  const delistToken = useCallback(
    async (id: bigint) => {
      if (!publicClient || !deployment.address) throw new Error("Contract not ready");
      setIsPending(true);
      setTxError(null);
      try {
        const hash = await writeContractAsync({
          address: deployment.address,
          abi: loanerAbi,
          functionName: "delist",
          args: [id],
        });
        const receipt = await waitSuccess(publicClient, hash);
        return receipt;
      } catch (err) {
        const msg = decodeContractError(err);
        setTxError(msg);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [publicClient, deployment.address, writeContractAsync]
  );

  const withdrawPending = useCallback(async () => {
    if (!publicClient || !deployment.address) throw new Error("Contract not ready");
    setIsPending(true);
    setTxError(null);
    try {
      const hash = await writeContractAsync({
        address: deployment.address,
        abi: loanerAbi,
        functionName: "withdraw",
      });
      const receipt = await waitSuccess(publicClient, hash);
      return receipt;
    } catch (err) {
      const msg = decodeContractError(err);
      setTxError(msg);
      throw err;
    } finally {
      setIsPending(false);
    }
  }, [publicClient, deployment.address, writeContractAsync]);

  const approveToken = useCallback(
    async (nft: Address, tokenId: bigint) => {
      if (!publicClient || !deployment.address) throw new Error("Contract not ready");
      setIsPending(true);
      setTxError(null);
      try {
        const hash = await writeContractAsync({
          address: nft,
          abi: erc721Abi,
          functionName: "approve",
          args: [deployment.address, tokenId],
        });
        const receipt = await waitSuccess(publicClient, hash);
        return receipt;
      } catch (err) {
        const msg = decodeContractError(err);
        setTxError(msg);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [publicClient, deployment.address, writeContractAsync]
  );

  const approveAll = useCallback(
    async (nft: Address) => {
      if (!publicClient || !deployment.address) throw new Error("Contract not ready");
      setIsPending(true);
      setTxError(null);
      try {
        const hash = await writeContractAsync({
          address: nft,
          abi: erc721Abi,
          functionName: "setApprovalForAll",
          args: [deployment.address, true],
        });
        const receipt = await waitSuccess(publicClient, hash);
        return receipt;
      } catch (err) {
        const msg = decodeContractError(err);
        setTxError(msg);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [publicClient, deployment.address, writeContractAsync]
  );

  return {
    listToken,
    rentToken,
    giveBackToken,
    claimDeposit,
    delistToken,
    withdrawPending,
    approveToken,
    approveAll,
    isPending,
    txError,
    clearTxError: () => setTxError(null),
  };
}
