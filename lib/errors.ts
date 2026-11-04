import { activeBotChain } from "@/lib/botchain/chain";
import { formatBot } from "@/lib/loaner";

/**
 * Decodes contract errors into user-friendly diagnostic messages matching spec §4.
 */
export function decodeContractError(err: unknown): string {
  // A wallet on the other BOT Chain network: writes are pinned to this build's chain (lib/useChainWrite.ts), so wagmi
  // refuses before the wallet opens. Say what to do, not the library's name for it.
  if (
    /ConnectorChainMismatch|chain mismatch|does not match the target chain/i.test(
      err instanceof Error ? `${err.name} ${err.message}` : String(err)
    )
  ) {
    return `Your wallet is on a different network. Switch it to ${activeBotChain.name}, then try again.`;
  }
  if (!err) return "An unexpected error occurred.";

  const message = err instanceof Error ? err.message : String(err);

  // User rejection
  if (
    message.includes("User rejected") ||
    message.includes("User denied") ||
    message.includes("declined the request")
  ) {
    return "Transaction was cancelled in your wallet.";
  }

  // Spec-exact custom errors (§4)
  if (message.includes("WrongPayment")) {
    const match = message.match(/WrongPayment\(uint256 expected:\s*(\d+)\)/);
    if (match && match[1]) {
      return `This rental costs ${formatBot(BigInt(match[1]))} BOT (fee plus deposit).`;
    }
    return "This rental payment does not match the required fee plus deposit.";
  }

  if (message.includes("NotReturned")) {
    return "The token didn't come back. Approve this contract, then try again.";
  }

  if (message.includes("TooLate")) {
    return "The grace period ended. The lender can keep the deposit.";
  }

  if (message.includes("NotOverdue")) {
    return "The deposit can be claimed only after the grace period ends.";
  }

  if (message.includes("NotHolder")) {
    return "You do not own this token.";
  }

  if (/NotOwnerOrApproved|not (token )?owner or approved|ERC721InsufficientApproval|caller is not token owner/i.test(message)) {
    return "Loaner has not been approved to move this token yet. Approve the token first, then try again.";
  }

  if (message.includes("EscrowFailed")) {
    return "Token escrow failed. Check token approval.";
  }

  if (message.includes("NotAvailable")) {
    return "This listing is not currently available for rent.";
  }

  if (message.includes("LenderCannotRent")) {
    return "You cannot rent your own listing.";
  }

  if (message.includes("NotRenter")) {
    return "Only the active renter can return this token.";
  }

  if (message.includes("NotRented")) {
    return "This listing is not currently rented.";
  }

  if (message.includes("NotLender")) {
    return "Only the listing lender can perform this action.";
  }

  if (message.includes("ZeroPrice")) {
    return "Price per day must be greater than zero.";
  }

  if (message.includes("ZeroDeposit")) {
    return "Deposit must be greater than zero.";
  }

  if (message.includes("BadDays")) {
    return "Rental duration must be between 1 and 90 days.";
  }

  if (message.includes("NothingToWithdraw")) {
    return "No pending balance to withdraw.";
  }

  if (message.includes("NotAContract")) {
    return "Target address is not a deployed contract.";
  }

  if (message.includes("Reentrancy")) {
    return "Reentrant call blocked.";
  }

  if (message.includes("insufficient funds")) {
    return "Insufficient BOT in your wallet for this transaction.";
  }

  return message.slice(0, 160);
}
