# Loaner

Lend an NFT. Keep the deposit if it doesn't come back.

Loaner is a lending library and escrow protocol for ERC-721 non-fungible tokens on BOT Chain. Lenders can list their utility passes, game assets, and membership tokens with a daily rental fee, security deposit, and maximum rental duration. Borrowers deposit the fee and security collateral to hold and use the real token. If returned on or before the due date, the renter recovers their deposit and the lender receives the rental fee. If the token is not returned before the 24-hour grace period expires, the lender can forfeit and keep the full deposit and fee.

## Protocol Limits & Parameters

All limits are enforced directly on-chain via immutable constants in `contracts/src/Loaner.sol` (`grep constant contracts/src/Loaner.sol`):

| Constant | Value | Description |
|---|---|---|
| `GRACE` | `1 days` (86,400s) | Grace period beyond due date before deposit can be forfeited |
| `MIN_DAYS` | `1` | Minimum allowable rental duration in days |
| `MAX_DAYS` | `90` | Maximum allowable rental duration in days |
| `MAX_BATCH` | `50` | Maximum listings returned by paginated views (`latest`) |

## Core Mechanics & Design

- **The One Transaction**: `rent(uint256 id, uint16 days_) payable` ("Rent this token").
- **Escrow & Safe Lending**: When a token is listed via `list(...)`, it is transferred directly into contract escrow.
- **Borrowing**: A renter pays `pricePerDay * days_ + deposit`. The contract sets `dueAt = block.timestamp + days_ * 1 days`, holds the payment, and transfers the token to the renter.
- **Returning**: The renter calls `giveBack(id)` before `dueAt + GRACE`. The contract transfers the token back to escrow, credits `fee` to `pending[lender]`, and refunds `deposit` to `pending[renter]`. The listing returns to `Available` for repeat borrowing.
- **Forfeiture**: If the token is not returned before `dueAt + GRACE`, the lender calls `claimDeposit(id)`. The contract credits the full held deposit and fee to `pending[lender]` and marks the listing `Settled`.
- **Pull Payments**: Sellers and borrowers retrieve balances via non-reentrant `withdraw()`.
- **Solvency Invariant**: `address(this).balance == sum(pending) + sum(held of Rented)`.
- **Archetype AN · Library Shelf Layout**: Displays listings as vertical book spines standing on wooden library shelf ledges with call numbers, spine titles, and due stamps. Clicking a spine pulls out the card-catalogue loan slip with token artwork, rental sliders, and live quotes.

## Local Development & Testing

```bash
# Run unit & fuzz tests
cd contracts && forge test

# Run stateful invariant solvency suite (32,768 calls)
cd contracts && forge test --match-contract LoanerInvariantTest

# Run mutation testing (25/25 mutants killed)
python3 scripts/mutate.py

# Run local stack runner with 7 seeded scenarios on port 8735
node scripts/local-stack.mjs

# Start frontend
npm run dev
```
