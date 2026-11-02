import { describe, it, expect } from "vitest";
import { parseEther } from "viem";
import {
  quote,
  dueAt,
  phase,
  approvalState,
  shelfColour,
  decodeDataUri,
  formatBot,
  formatDueStamp,
  ListingState,
  type ListingData,
} from "../loaner";
import { GRACE } from "../limits";

describe("Loaner Library Logic", () => {
  it("computes rental quote accurately", () => {
    const pricePerDay = parseEther("0.5");
    const deposit = parseEther("2.0");
    const total = quote(pricePerDay, deposit, 4);
    expect(total).toBe(parseEther("4.0"));
  });

  it("calculates due date correctly", () => {
    const now = 1700000000;
    expect(dueAt(now, 3)).toBe(now + 3 * 86400);
  });

  it("evaluates listing phases across states and time", () => {
    const now = 1700000000;
    const baseListing: ListingData = {
      id: 1n,
      lender: "0x1111111111111111111111111111111111111111",
      nft: "0x2222222222222222222222222222222222222222",
      tokenId: 1n,
      pricePerDay: parseEther("0.1"),
      deposit: parseEther("1.0"),
      maxDays: 14,
      state: ListingState.Available,
      renter: "0x0000000000000000000000000000000000000000",
      dueAt: 0n,
      held: 0n,
    };

    expect(phase(baseListing, now)).toBe("available");

    const rentedListing: ListingData = {
      ...baseListing,
      state: ListingState.Rented,
      dueAt: BigInt(now + 2 * 86400),
      held: parseEther("1.2"),
    };

    // Active rental
    expect(phase(rentedListing, now)).toBe("rented");

    // Overdue inside grace period (1 day past due)
    const inGraceNow = now + 2 * 86400 + 43200;
    expect(phase(rentedListing, inGraceNow)).toBe("overdue");

    // Forfeitable after grace period
    const afterGraceNow = now + 2 * 86400 + GRACE + 10;
    expect(phase(rentedListing, afterGraceNow)).toBe("forfeitable");

    // Delisted
    expect(phase({ ...baseListing, state: ListingState.Delisted }, now)).toBe("delisted");

    // Forfeited
    expect(phase({ ...baseListing, state: ListingState.Settled }, now)).toBe("forfeited");
  });

  it("computes approval states correctly", () => {
    const spender = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const other = "0x0000000000000000000000000000000000000001";

    expect(approvalState(spender, false, other).isApproved).toBe(false);
    expect(approvalState(spender, false, spender).isApproved).toBe(true);
    expect(approvalState(spender, true, other).isApproved).toBe(true);
  });

  it("hashes shelf colours deterministically with high contrast", () => {
    const c1 = shelfColour("0x1234567890123456789012345678901234567890");
    const c2 = shelfColour("0x1234567890123456789012345678901234567890");
    expect(c1.bg).toBe(c2.bg);
    expect(c1.fg).toBe("#FFFFFF");
  });

  it("decodes token data URIs safely and caps size", () => {
    const json = JSON.stringify({
      name: "Special Pass",
      description: "VIP ticket",
      image: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    });
    const dataUri = `data:application/json;base64,${btoa(json)}`;
    const decoded = decodeDataUri(dataUri);

    expect(decoded.name).toBe("Special Pass");
    expect(decoded.imageSrc).toContain("data:image/svg+xml");

    // Oversized check
    const oversized = "data:application/json;base64," + "A".repeat(600 * 1024);
    expect(decodeDataUri(oversized).name).toBe("Oversized Token");
  });

  it("formats due dates and BOT currencies properly", () => {
    expect(formatBot(parseEther("1.5"))).toBe("1.500");
    expect(formatDueStamp(1710374400)).toContain("DUE 14 MAR");
  });
});
