# Architectural & Security Decisions: Loaner

## 1. Storage & State Machine
- Sequential listing IDs starting at 1 via `listingCount`.
- Four lifecycle states:
  - `Available`: Escrowed by contract, open for rental or delisting.
  - `Rented`: Token transferred to renter, rental fee and deposit held in escrow.
  - `Delisted`: Token returned to lender, listing inactive.
  - `Settled`: Deposit forfeited to lender after grace period ended; token retained by renter, listing permanently closed.
- **Listing Reusability**: When a rented token is returned via `giveBack()`, the listing transitions back to `Available`, allowing the lender to earn repeat rental yield without repetitive deposit transfers.

## 2. Rental Settlement & Grace Period
- **Payment Split**: Total payment = `pricePerDay * days + deposit`.
- When `giveBack()` succeeds before `dueAt + GRACE`:
  - `fee = held - deposit` is credited to `pending[lender]`.
  - `deposit` is credited to `pending[renter]`.
  - Token is returned to contract escrow.
- When `claimDeposit()` is called after `dueAt + GRACE`:
  - Full `held` (fee + deposit) is credited to `pending[lender]`.
  - State moves to `Settled` (token remains with renter).

## 3. Invariant & Solvency Guarantees
- Invariant: `address(this).balance == sum(pending) + sum(held of Rented)`.
- Verified across 32,768 stateful fuzzing calls in `LoanerInvariant.t.sol` with zero balance discrepancies.

## 4. Hostile ERC-721 Protection & Checks-Effects-Interactions
- `nonReentrant` mutex on all state-mutating functions (`list`, `rent`, `giveBack`, `claimDeposit`, `delist`, `withdraw`).
- Reentrancy callbacks during ERC-721 transfers are blocked.
- Checks `ownerOf(tokenId) == address(this)` after inbound transfers to ensure tokens genuinely arrived in contract custody.
- Pull-payment pattern: all disbursements route through `pending` mappings and require voluntary `withdraw()` calls.
