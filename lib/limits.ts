/**
 * Protocol limits and parameters for Loaner (contracts/src/Loaner.sol).
 *
 * Kept in lockstep with the contract constants (`grep constant contracts/src/Loaner.sol`).
 */

export const GRACE = 86400; // 1 days (86,400 seconds)
export const MIN_DAYS = 1;
export const MAX_DAYS = 90;
export const MAX_BATCH = 50;
