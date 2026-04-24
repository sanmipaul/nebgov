# Treasury Flows

NebGov treasury supports two distinct fund movement flows. They share the same treasury balance but have different authorization and execution guarantees.

## Flow 1: Multi-sig Internal Transaction

```text
Owner A -> submit(target, data) -> tx_id
Owner B -> approve(tx_id)       -> approvals: 1/2
Owner C -> approve(tx_id)       -> approvals: 2/2 -> auto-execute
```

### How it works

- `submit` is treasury-owner only
- `data` is XDR-encoded calldata (same encoding model used by governor actions)
- Once approvals reach `threshold`, the transaction auto-executes
- Cancellation is treasury-owner only and applies to pending (not yet executed) transactions

### SDK example

```ts
import { TreasuryClient } from "@nebgov/sdk";

const treasury = new TreasuryClient({
  treasuryAddress: process.env.NEXT_PUBLIC_TREASURY_ADDRESS!,
  network: "testnet",
});

const txId = await treasury.submitWithSign(
  signerPublicKey,
  targetContract,
  encodedCalldataBytes,
  signTransaction,
);

await treasury.approveWithSign(signerPublicKey, Number(txId), signTransaction);
```

## Flow 2: Governor-Controlled Batch Transfer

```text
Governance proposal -> execute -> timelock -> batch_transfer(token, recipients)
```

### How it works

- The proposal targets treasury `batch_transfer` with encoded calldata
- Execution is timelock-gated; no direct instant execution path
- Transfer list is atomic: all recipients succeed or the whole call reverts
- The call returns an `op_hash` for auditability and reconciliation

### Build `batch_transfer` calldata with SDK helpers

```ts
import { GovernorClient } from "@nebgov/sdk";
import { encodeGovernorCalldataBytes } from "../app/src/lib/treasury-calldata";

const governor = new GovernorClient({
  governorAddress: process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS!,
  timelockAddress: process.env.NEXT_PUBLIC_TIMELOCK_ADDRESS!,
  votesAddress: process.env.NEXT_PUBLIC_VOTES_ADDRESS!,
  network: "testnet",
});

const calldata = encodeGovernorCalldataBytes([
  { kind: "address", value: tokenAddress },
  { kind: "address", value: recipientA },
  { kind: "i128", value: "1000000" },
  { kind: "address", value: recipientB },
  { kind: "i128", value: "2500000" },
]);

await governor.proposeWithSign(
  proposer,
  "Treasury disbursement",
  descriptionHash,
  metadataUri,
  [treasuryAddress],
  ["batch_transfer"],
  [calldata],
  signTransaction,
);
```

### Transfer history via indexer

- Indexer consumers should track treasury events emitted on execution path
- Filter by treasury contract id and operation hash (`op_hash`) to reconstruct payout batches
- Correlate proposal id -> queue tx -> execute tx for a full audit chain

## Security Model

- **Treasury owners**: can submit/approve/cancel internal multi-sig transactions
- **Governor + timelock**: can execute governance-authorized treasury actions such as `batch_transfer`
- **Guardian veto window**: queued proposals targeting treasury can still be cancelled during timelock delay
- **Wrapper withdrawal locking**: not applicable here; treasury does not use token wrapper locks

## Source Links

- Governor contract: `contracts/governor/src/lib.rs`
- Timelock contract: `contracts/timelock/src/lib.rs`
- Treasury contract: `contracts/treasury/src/lib.rs`
- ADR-008 (treasury execution model): `docs/adr/adr-008-treasury-execution-surface.md`
