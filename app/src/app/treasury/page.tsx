"use client";

/**
 * Treasury page — shows balances and pending multi-sig transactions.
 * TODO issue #48: fetch real treasury balance via Stellar SDK + pending TxProposals.
 */

export default function TreasuryPage() {
  const mockTxs = [
    { id: 1n, description: "Send 1000 USDC to grants committee", approvals: 2, threshold: 3 },
    { id: 2n, description: "Fund bug bounty pool", approvals: 1, threshold: 3 },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Treasury</h1>

      {/* Balances — TODO issue #48: fetch from Horizon account balances */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <p className="text-sm text-gray-500">USDC Balance</p>
          <p className="text-2xl font-bold mt-1">— USDC</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <p className="text-sm text-gray-500">XLM Balance</p>
          <p className="text-2xl font-bold mt-1">— XLM</p>
        </div>
      </div>

      {/* Pending transactions */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Pending Transactions
      </h2>
      <div className="space-y-3">
        {mockTxs.map((tx) => (
          <div
            key={tx.id.toString()}
            className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">
                {tx.description}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {tx.approvals}/{tx.threshold} approvals
              </p>
            </div>
            {/* TODO issue #48: wire to TreasuryContract.approve() */}
            <button className="text-sm text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors">
              Approve
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
