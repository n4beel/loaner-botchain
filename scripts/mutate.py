import os
import subprocess
import sys

ORIGINAL_SOL = "contracts/src/Loaner.sol"
BACKUP_SOL = "contracts/src/Loaner.sol.orig"

mutants = [
    # M01: Allow non-contract as NFT
    ("M01", "list", "if (nft.code.length == 0) revert NotAContract();", "/* if (nft.code.length == 0) revert NotAContract(); */"),
    # M02: Allow zero price per day
    ("M02", "list", "if (pricePerDay == 0) revert ZeroPrice();", "/* if (pricePerDay == 0) revert ZeroPrice(); */"),
    # M03: Allow zero deposit
    ("M03", "list", "if (deposit == 0) revert ZeroDeposit();", "/* if (deposit == 0) revert ZeroDeposit(); */"),
    # M04: Allow 0 maxDays
    ("M04", "list", "maxDays < MIN_DAYS ||", "false ||"),
    # M05: Allow maxDays > MAX_DAYS (90 days)
    ("M05", "list", "maxDays > MAX_DAYS", "false"),
    # M06: Allow non-holder to list token
    ("M06", "list", "if (IERC721(nft).ownerOf(tokenId) != msg.sender) revert NotHolder();", "/* if (IERC721(nft).ownerOf(tokenId) != msg.sender) revert NotHolder(); */"),
    # M07: Do not verify token arrived in escrow
    ("M07", "list", "if (IERC721(nft).ownerOf(tokenId) != address(this)) revert EscrowFailed();", "/* if (IERC721(nft).ownerOf(tokenId) != address(this)) revert EscrowFailed(); */"),
    # M08: Allow renting non-existent listing
    ("M08", "rent", "if (id == 0 || id > listingCount) revert NoSuchListing();", "/* if (id == 0 || id > listingCount) revert NoSuchListing(); */"),
    # M09: Allow renting non-available listing
    ("M09", "rent", "if (id == 0 || id > listingCount) revert NoSuchListing();\n        Listing storage l = _listings[id];\n\n        if (l.state != State.Available) revert NotAvailable();", "if (id == 0 || id > listingCount) revert NoSuchListing();\n        Listing storage l = _listings[id];\n\n        /* if (l.state != State.Available) revert NotAvailable(); */"),
    # M10: Allow renting for 0 days
    ("M10", "rent", "days_ < MIN_DAYS ||", "false ||"),
    # M11: Allow renting beyond maxDays
    ("M11", "rent", "days_ > l.maxDays", "false"),
    # M12: Allow lender to rent their own listing
    ("M12", "rent", "if (msg.sender == l.lender) revert LenderCannotRent();", "/* if (msg.sender == l.lender) revert LenderCannotRent(); */"),
    # M13: Allow wrong payment amount in rent
    ("M13", "rent", "if (msg.value != expectedPayment) revert WrongPayment(expectedPayment);", "/* if (msg.value != expectedPayment) revert WrongPayment(expectedPayment); */"),
    # M14: Do not set state to Rented
    ("M14", "rent", "l.state = State.Rented;", "/* l.state = State.Rented; */"),
    # M15: Allow non-renter to giveBack
    ("M15", "giveBack", "if (l.state != State.Rented) revert NotRented();\n        if (msg.sender != l.renter) revert NotRenter();", "if (l.state != State.Rented) revert NotRented();\n        /* if (msg.sender != l.renter) revert NotRenter(); */"),
    # M16: Allow giving back non-rented listing
    ("M16", "giveBack", "if (l.state != State.Rented) revert NotRented();", "/* if (l.state != State.Rented) revert NotRented(); */"),
    # M17: Allow giving back after grace period ended
    ("M17", "giveBack", "if (block.timestamp > l.dueAt + GRACE) revert TooLate();", "/* if (block.timestamp > l.dueAt + GRACE) revert TooLate(); */"),
    # M18: Do not credit lender fee in giveBack
    ("M18", "giveBack", "pending[l.lender] += fee;", "/* pending[l.lender] += fee; */"),
    # M19: Do not refund renter deposit in giveBack
    ("M19", "giveBack", "pending[l.renter] += dep;", "/* pending[l.renter] += dep; */"),
    # M20: Allow non-lender to claim deposit
    ("M20", "claimDeposit", "if (msg.sender != l.lender) revert NotLender();", "/* if (msg.sender != l.lender) revert NotLender(); */"),
    # M21: Allow claiming deposit on non-rented listing
    ("M21", "claimDeposit", "if (l.state != State.Rented) revert NotRented();", "/* if (l.state != State.Rented) revert NotRented(); */"),
    # M22: Allow claiming deposit before grace period ended
    ("M22", "claimDeposit", "if (block.timestamp <= readyAt) revert NotOverdue(readyAt);", "/* if (block.timestamp <= readyAt) revert NotOverdue(readyAt); */"),
    # M23: Allow non-lender to delist
    ("M23", "delist", "if (msg.sender != l.lender) revert NotLender();", "/* if (msg.sender != l.lender) revert NotLender(); */"),
    # M24: Allow delisting non-available listing
    ("M24", "delist", "if (msg.sender != l.lender) revert NotLender();\n        if (l.state != State.Available) revert NotAvailable();", "if (msg.sender != l.lender) revert NotLender();\n        /* if (l.state != State.Available) revert NotAvailable(); */"),
    # M25: Do not zero pending balance before transfer in withdraw
    ("M25", "withdraw", "pending[msg.sender] = 0;", "/* pending[msg.sender] = 0; */"),
]

def run():
    print(f"Running mutation testing with {len(mutants)} mutants...")
    with open(ORIGINAL_SOL, "r") as f:
        original_code = f.read()

    with open(BACKUP_SOL, "w") as f:
        f.write(original_code)

    killed = 0
    survived = []

    try:
        for mid, fn, target, replacement in mutants:
            if target not in original_code:
                print(f"ERROR: Mutant {mid} target pattern not found in code:\n  '{target}'")
                sys.exit(1)

            mutated = original_code.replace(target, replacement, 1)
            with open(ORIGINAL_SOL, "w") as f:
                f.write(mutated)

            res = subprocess.run(
                ["forge", "test", "--match-contract", "LoanerTest"],
                cwd="contracts",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

            if res.returncode != 0:
                print(f"  ✓ {mid} ({fn}) KILLED")
                killed += 1
            else:
                print(f"  ✗ {mid} ({fn}) SURVIVED")
                survived.append(mid)

    finally:
        with open(BACKUP_SOL, "r") as f:
            clean = f.read()
        with open(ORIGINAL_SOL, "w") as f:
            f.write(clean)
        if os.path.exists(BACKUP_SOL):
            os.remove(BACKUP_SOL)

    print(f"\nMutation score: {killed}/{len(mutants)} ({killed/len(mutants)*100:.1f}%)")
    if survived:
        print(f"Survived mutants: {survived}")
        sys.exit(1)
    else:
        print("All mutants killed successfully!")

if __name__ == "__main__":
    run()
