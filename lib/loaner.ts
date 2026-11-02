import type { Address } from "viem";
import { formatEther } from "viem";
import { GRACE } from "@/lib/limits";

export enum ListingState {
  Available = 0,
  Rented = 1,
  Delisted = 2,
  Settled = 3,
}

export type RentalPhase =
  | "available"
  | "rented"
  | "overdue"
  | "forfeitable"
  | "delisted"
  | "forfeited";

export interface ListingData {
  id: bigint;
  lender: Address;
  nft: Address;
  tokenId: bigint;
  pricePerDay: bigint;
  deposit: bigint;
  maxDays: number;
  state: ListingState;
  renter: Address;
  dueAt: bigint;
  held: bigint;
}

export interface ApprovalStatus {
  isApproved: boolean;
  isOperator: boolean;
  isTokenApproved: boolean;
}

export interface DecodedMetadata {
  name: string;
  description: string;
  imageSrc: string | null;
}

/**
 * Calculates rental total cost (fee + deposit)
 */
export function quote(pricePerDay: bigint, deposit: bigint, days_: number): bigint {
  return pricePerDay * BigInt(days_) + deposit;
}

/**
 * Calculates due timestamp
 */
export function dueAt(nowSec: number, days_: number): number {
  return nowSec + days_ * 86400;
}

/**
 * Determines current lifecycle phase of a listing based on timestamps and state
 */
export function phase(listing: ListingData, nowSec: number): RentalPhase {
  if (listing.state === ListingState.Available) return "available";
  if (listing.state === ListingState.Delisted) return "delisted";
  if (listing.state === ListingState.Settled) return "forfeited";

  if (listing.state === ListingState.Rented) {
    const due = Number(listing.dueAt);
    if (nowSec <= due) {
      return "rented";
    }
    if (nowSec <= due + GRACE) {
      return "overdue";
    }
    return "forfeitable";
  }

  return "available";
}

/**
 * Evaluates whether spender is approved to transfer the token
 */
export function approvalState(
  spender: Address,
  isApprovedForAll: boolean,
  approvedAddress: Address
): ApprovalStatus {
  const isOperator = isApprovedForAll;
  const isTokenApproved =
    Boolean(approvedAddress) &&
    approvedAddress.toLowerCase() === spender.toLowerCase();
  const isApproved = isOperator || isTokenApproved;

  return {
    isApproved,
    isOperator,
    isTokenApproved,
  };
}

/** Muted archival library bookcloth palette */
const BOOK_PALETTE = [
  { bg: "#722F37", fg: "#FFFFFF", name: "Burgundy" },
  { bg: "#2C5E3B", fg: "#FFFFFF", name: "Forest" },
  { bg: "#1B3B6F", fg: "#FFFFFF", name: "Navy" },
  { bg: "#8A5A00", fg: "#FFFFFF", name: "Ochre" },
  { bg: "#4A2E50", fg: "#FFFFFF", name: "Aubergine" },
  { bg: "#3D5A80", fg: "#FFFFFF", name: "Slate" },
  { bg: "#6F4E37", fg: "#FFFFFF", name: "Leather" },
  { bg: "#3E5C59", fg: "#FFFFFF", name: "Pine" },
  { bg: "#2A6F97", fg: "#FFFFFF", name: "Ink Blue" },
  { bg: "#5A3D28", fg: "#FFFFFF", name: "Chestnut" },
];

/**
 * Deterministically generates an archival book spine colour hashed from contract address
 */
export function shelfColour(address: string | Address): { bg: string; fg: string; name: string } {
  if (!address || address.length < 6) return BOOK_PALETTE[0];
  let hash = 0;
  const clean = address.toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return BOOK_PALETTE[hash % BOOK_PALETTE.length];
}

/** Max allowed data URI size: 512 KB to avoid UI lockups */
const MAX_METADATA_BYTES = 512 * 1024;

/**
 * Safely decodes ERC-721 tokenURI when formatted as a data URI.
 * Guaranteed to only render via <img>, never injected raw into DOM.
 */
export function decodeDataUri(tokenUri: string): DecodedMetadata {
  if (!tokenUri || typeof tokenUri !== "string") {
    return { name: "", description: "", imageSrc: null };
  }

  if (tokenUri.length > MAX_METADATA_BYTES) {
    return { name: "Oversized Token", description: "Metadata exceeds size limit", imageSrc: null };
  }

  // Handle data:application/json;base64,...
  if (tokenUri.startsWith("data:application/json;base64,")) {
    try {
      const base64Data = tokenUri.slice("data:application/json;base64,".length);
      const decodedJson = atob(base64Data);
      const parsed = JSON.parse(decodedJson);

      let imageSrc: string | null = null;
      if (typeof parsed.image === "string" && parsed.image.length <= MAX_METADATA_BYTES) {
        imageSrc = parsed.image;
      }

      return {
        name: typeof parsed.name === "string" ? parsed.name : "",
        description: typeof parsed.description === "string" ? parsed.description : "",
        imageSrc,
      };
    } catch {
      return { name: "", description: "", imageSrc: null };
    }
  }

  // Handle data:image/svg+xml;base64,... or data:image/svg+xml;utf8,...
  if (tokenUri.startsWith("data:image/svg+xml")) {
    return {
      name: "",
      description: "",
      imageSrc: tokenUri,
    };
  }

  // Normal https/http URL
  if (tokenUri.startsWith("https://") || tokenUri.startsWith("http://")) {
    return {
      name: "",
      description: "",
      imageSrc: tokenUri,
    };
  }

  return { name: "", description: "", imageSrc: null };
}

export function formatBot(amountWei: bigint | number | string): string {
  const wei = BigInt(amountWei);
  const formatted = formatEther(wei);
  const num = parseFloat(formatted);
  if (num === 0) return "0.000";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 4,
  });
}

export function formatAddress(address?: string | null): string {
  if (!address) return "—";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatDueStamp(dueTimestampSec: bigint | number): string {
  const ts = Number(dueTimestampSec);
  if (ts <= 0) return "—";
  const date = new Date(ts * 1000);
  const day = date.getUTCDate();
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  return `DUE ${day} ${month}`;
}
