# Governance Parameter Updates via Proposal

This guide explains how to update governor configuration parameters (quorum, voting period, thresholds) through on-chain governance proposals.

## Overview

NebGov allows protocol parameters to evolve over time without requiring contract redeployment. The `update_config()` function can only be called by the governor contract itself, meaning it must be executed through a passed governance proposal.

## Configurable Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `voting_delay` | `u32` | Ledgers between proposal creation and voting start |
| `voting_period` | `u32` | Duration of the voting window in ledgers |
| `quorum_numerator` | `u32` | Minimum participation percentage (0-100) |
| `proposal_threshold` | `i128` | Minimum voting power required to create proposals |

## Creating a Parameter Update Proposal

### Using the SDK

```typescript
import { GovernorClient, GovernorSettings } from "@nebgov/sdk";
import { Keypair } from "@stellar/stellar-sdk";

const client = new GovernorClient({
  governorAddress: "CABC...",
  timelockAddress: "CDEF...",
  votesAddress: "CGHI...",
  network: "testnet",
});

const signer = Keypair.fromSecret("S...");

// Define new settings (e.g., increase quorum from 4% to 5%)
const newSettings: GovernorSettings = {
  votingDelay: 100,
  votingPeriod: 17280,
  quorumNumerator: 5,  // Changed from 4 to 5
  proposalThreshold: 100000000n,
};

// Build the proposal calldata
const { target, fnName, calldata } = client.buildUpdateConfigProposal(newSettings);

// Create the proposal
const proposalId = await client.propose(
  signer,
  "Increase quorum requirement from 4% to 5%",
  target,
  fnName,
  calldata
);

console.log("Proposal created:", proposalId);
```

### Using the CLI

```bash
# First, encode the new settings as XDR
# Then create a proposal targeting the governor's update_config function

stellar contract invoke \
  --id $GOVERNOR_ADDRESS \
  --source deployer \
  --network testnet \
  -- propose \
  --proposer $(stellar keys address deployer) \
  --description "Increase quorum from 4% to 5%" \
  --targets '["'$GOVERNOR_ADDRESS'"]' \
  --fn_names '["update_config"]' \
  --calldatas '["<encoded-settings-xdr>"]'
```

## Proposal Lifecycle

1. **Create Proposal**: Submit the `update_config` proposal with new settings
2. **Voting Delay**: Wait for `voting_delay` ledgers
3. **Voting Period**: Token holders vote during `voting_period` ledgers
4. **Queue**: If passed, queue the proposal in the timelock
5. **Timelock Delay**: Wait for the mandatory execution delay
6. **Execute**: Execute the proposal to apply new settings

## Security Considerations

- Only the governor contract itself can call `update_config()`
- This is enforced by `env.current_contract_address().require_auth()`
- The timelock provides a mandatory delay, giving users time to react
- A `ConfigUpdated` event is emitted with both old and new settings

## Events

When configuration is updated, a `ConfigUpdated` event is emitted:

```rust
events::emit_config_updated(&env, &old_settings, &new_settings);
```

This allows off-chain indexers and frontends to track parameter changes over time.

## Best Practices

1. **Gradual Changes**: Make incremental adjustments rather than dramatic shifts
2. **Community Discussion**: Discuss proposed changes in governance forums before submitting
3. **Clear Descriptions**: Write detailed proposal descriptions explaining the rationale
4. **Testing**: Test parameter changes on testnet before mainnet proposals
5. **Monitoring**: Watch for the `ConfigUpdated` event to confirm changes took effect
