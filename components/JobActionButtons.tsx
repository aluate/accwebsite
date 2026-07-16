"use client";

/**
 * JobActionButtons — client wrapper for modal-based job actions.
 *
 * Rendered inside the server-rendered job detail page.
 * Holds open/close state for Send Bid and Send Contract modals.
 */

import { useState } from "react";
import { SendBidModal } from "@/components/SendBidModal";
import { SendContractModal } from "@/components/SendContractModal";

const BID_STAGES = ["intake", "bid"];
const CONTRACT_STAGES = ["bid", "design", "field_dims"];

type Props = {
  jobId: string;
  jobStatus: string;
  clientEmail: string | null;
  canManage: boolean;
};

export function JobActionButtons({ jobId, jobStatus, clientEmail, canManage }: Props) {
  const [showBid, setShowBid] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [bidSent, setBidSent] = useState(false);
  const [contractSent, setContractSent] = useState(false);

  if (!canManage) return null;

  const showBidBtn = BID_STAGES.includes(jobStatus);
  const showContractBtn = CONTRACT_STAGES.includes(jobStatus);

  return (
    <>
      {showBidBtn && (
        <button
          onClick={() => setShowBid(true)}
          className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
            bidSent
              ? "border-green-700/40 text-green-400/70 bg-green-900/10"
              : "border-[#f08122]/40 text-[#f08122] bg-[#f08122]/10 hover:bg-[#f08122]/20"
          }`}
        >
          {bidSent ? "✓ Bid Sent" : "Send Bid →"}
        </button>
      )}

      {showContractBtn && (
        <button
          onClick={() => setShowContract(true)}
          className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
            contractSent
              ? "border-green-700/40 text-green-400/70 bg-green-900/10"
              : "border-white/20 text-white/70 bg-white/5 hover:bg-white/10"
          }`}
        >
          {contractSent ? "✓ Contract Sent" : "Send Contract →"}
        </button>
      )}

      {showBid && (
        <SendBidModal
          jobId={jobId}
          clientEmail={clientEmail}
          onClose={() => setShowBid(false)}
          onSent={() => { setShowBid(false); setBidSent(true); }}
        />
      )}

      {showContract && (
        <SendContractModal
          jobId={jobId}
          clientEmail={clientEmail}
          onClose={() => setShowContract(false)}
          onSent={() => { setShowContract(false); setContractSent(true); }}
        />
      )}
    </>
  );
}
