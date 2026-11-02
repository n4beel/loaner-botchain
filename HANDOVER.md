# Loaner Handover Report

> Lend an NFT. Keep the deposit if it doesn't come back.

## Status: Ready for Handover

Loaner is complete, verified, and adheres to all requirements specified in `docs/specs/35-loaner.md`, `00-CONVENTIONS.md`, and `IMPLEMENT-WAVE3.md`.

## 1. Contract & Invariants (`Loaner.sol`)

- **The One Transaction**: `rent(uint256 id, uint16 days_) payable` ("Rent this token")
- **Core Architecture & Mechanics**:
  - `list(nft, tokenId, pricePerDay, deposit, maxDays)` escrows token into contract and creates listing.
  - `rent(id, days_)` payable: transfers token to renter, records `dueAt`, and holds fee + deposit.
  - `giveBack(id)`: returns token to contract escrow, refunds deposit to renter, and credits fee to lender. Listing transitions back to `Available` for repeat borrowing without re-depositing.
  - `claimDeposit(id)`: lender claims full held deposit and fee after `dueAt + GRACE` (1 day past due date). Listing transitions to `Settled` (token remains permanently with renter).
  - `delist(id)`: lender reclaims token from escrow while `Available`.
  - `withdraw()`: non-reentrant pull payment for lenders and refunded borrowers.
  - Solvency guarantee: `address(this).balance == sum(pending) + sum(held of Rented)`.
- **Protocol Limits (Direct from Contract Constants)**:
  - `GRACE = 1 days` (86,400 seconds)
  - `MIN_DAYS = 1`
  - `MAX_DAYS = 90`
  - `MAX_BATCH = 50`

## 2. Test Verification

### 2.1 Foundry Test Suite
- **19 Forge tests passed**:
  - 18 Unit & Fuzz tests (`Loaner.t.sol`): `test_ListEscrowsToken`, `test_RentPaysExactAndTransfersToken`, `test_RentWrongPaymentReverts`, `test_ReturnPaysLenderFeeAndRefundsDeposit`, `test_ReturnWithoutApprovalReverts_NoStateChange`, `test_ReturnAfterGraceReverts`, `test_ClaimDepositOnlyAfterGrace`, `test_ClaimDepositOnlyLender`, `test_DelistReturnsToken`, `test_DelistWhileRentedReverts`, `test_LenderCannotRent`, `test_HostileNftReentrancyBlocked`, `test_ReentrantWithdrawBlocked`, `test_QuoteMatchesRequirement`, `test_CannotRentAlreadyRented`, `test_CannotWithdrawTwice`, `test_DelistAlreadyDelistedReverts`, `test_ValidationReverts`, `test_DeceptiveNftEscrowReverts`, `test_LatestPagination`, `testFuzz_Conservation`.
  - 1 Invariant Suite (`LoanerInvariant.t.sol`): 32,768 stateful calls across 256 runs asserting `address(this).balance == sum(pending) + sum(held of Rented)` with 0 balance discrepancies.
- **Mutation Testing (`scripts/mutate.py`)**:
  - 25 of 25 mutants killed (100% mutation score).

### 2.2 Vitest Unit & Lint Suite
- **53 Vitest unit & lint tests passed**:
  - Hook-deps lint: 4 tests passed.
  - Network pinning lint (`test/lint/chain-write-pinned.test.ts`): 6 tests passed.
  - Loaner unit tests (`lib/__tests__/loaner.test.ts`): 7 tests passed (`quote`, `dueAt`, `phase`, `approvalState`, `shelfColour`, `decodeDataUri`, `formatBot`, `formatDueStamp`).
  - Limits, active chain, wagmi chains, amount, deployment, wallet tests: 36 tests passed.

### 2.3 On-Chain Integration Tests (`test/integration/loaner.test.ts`)
- **7 Integration tests passed** against local Anvil on port 8635:
  - Full rental & return lifecycle: token moves to borrower and back, pending balances credit accurately.
  - Rental forfeiture lifecycle: deposit claimed after grace period, borrower retains token.
  - Unauthorized actions & payment checks: wrong payments and unauthorized actions revert cleanly.
  - ABI verification: `abi-matches-contract.test.ts`.

## 3. Frontend & Archetype AN · Library Shelf

- **Archetype AN Implementation**:
  - **The Library Shelf (`LibraryShelf.tsx`)**: Realistic wooden shelf ledges (`library-shelf-board`) supporting vertical book spines. Responsive shelf rows wrap smoothly to the viewport.
  - **The Book Spine (`BookSpine.tsx`)**: Vertical book spine with call numbers, vertical title, lender address, and phase status ribbon (Available, Due date stamp, Grace, Claim, Closed, Kept). Deterministically colored from a muted archival bookcloth palette hashed from the contract address.
  - **The Loan Slip (`LoanSlip.tsx`)**: Card-catalogue slip with token artwork, rental sliders, live quote preview, 2-step return approval indicator, and lender deposit forfeiture controls.
  - **Notice Placard (`LoanerNotice.tsx`)**: "What a loan can't guarantee" notice detailing that the renter holds the real token, utility depends on external apps, and the deposit can be kept after grace ends.
- **Shared UI Contract**:
  - 3 footer links on every route (`botchain.ai`, `scan.botchain.ai`, and contract on explorer via `BuiltOnBotChain`).
  - Wallet menu uses opaque `--menu-*` tokens.
  - Active network pinning to `activeBotChain.id`.

## 4. Policy Check Scripts

All four check scripts exit 0:
1. `python3 scripts/check-distinct.py loaner`: 0 issues across all 50 projects.
2. `python3 scripts/check-ui-contract.py loaner`: OK (3 footer links, wallet menu, network pin).
3. `python3 scripts/check-tokens.py loaner`: OK (all required CSS tokens defined).
4. `python3 scripts/check-honesty.py loaner`: OK (0 honesty findings).
