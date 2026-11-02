import React from "react";

export function LoanerNotice() {
  return (
    <div
      className="p-5 md:p-6 rounded-sm border"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
        boxShadow: "0 1px 4px rgba(46, 31, 20, 0.04)",
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="w-5 h-5 rounded-xs flex items-center justify-center font-serif text-xs font-bold text-white flex-shrink-0 mt-0.5"
          style={{ backgroundColor: "var(--accent)" }}
        >
          §
        </span>
        <div className="flex flex-col gap-2">
          <h3
            className="font-title text-sm md:text-base font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            What a loan can&apos;t guarantee
          </h3>

          <ul className="flex flex-col gap-1.5 text-xs font-serif leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <li>
              <strong className="text-[var(--text-primary)]">
                The renter holds the real token and could send it anywhere.
              </strong>{" "}
              The deposit is your only protection. Set the deposit at least as high as the token is worth to you.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">
                What &ldquo;holding it&rdquo; means is up to each app.
              </strong>{" "}
              The contract cannot enforce utility or membership privileges in third-party environments.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">
                One day late and the deposit can be kept.
              </strong>{" "}
              Once the 24-hour grace period ends, the loan effectively becomes a sale and the lender can forfeit the deposit.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
export default LoanerNotice;
