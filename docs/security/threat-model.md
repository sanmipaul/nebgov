# NebGov Governance Threat Model

This document catalogs known attack vectors against the NebGov governance protocol, their mitigations, and residual risks. It is intended for auditors, security researchers, and DAO operators.

**Status**: This document is pending external review before merge.

## Overview

| Assumptions | Description |
|-------------|-------------|
| Network | Stellar/Soroban |
| Token | ERC-20 or native Stellar asset |
| Execution model | Soroban smart contracts |

The governance protocol controls:
- Protocol parameter updates
- Treasury fund management
- Contract upgrades

## Attack Vectors

### 1. Flash Loan Voting

| Attribute | Value |
|-----------|-------|
| Severity | Medium |
| Category | Voting manipulation |
| ADR Reference | [ADR-001](./adr/adr-001-checkpoint-voting-power.md) |

**Description**: An attacker borrows a large amount of tokens, creates or votes on a proposal, and repays the loan within a single transaction. Without protections, voting power scales with borrowed tokens.

**Attack Scenario**:
1. Attacker borrows 10M tokens from a lending protocol
2. Creates a proposal to transfer treasury funds to attacker address
3. Votes YES using borrowed tokens
4. Repays loan in the same transaction
5. Proposal passes due to inflated voting power

**Mitigation**: Checkpoint-based voting power (ADR-001). Voting power is snapshotted at `proposal.start_ledger` — the ledger when the proposal is created. The `token-votes` contract records checkpoints whenever a user's voting power changes (delegation or transfer). At vote time, the governor queries historical voting power at the proposal creation ledger.

**Residual Risk**: Tokens acquired *before* proposal creation but *after* the attacker's last checkpoint still count. Attackers with existing token holdings can amplify their voting power by borrowing additional tokens before creating a proposal. Mitigation assumes attackers cannot manipulate their checkpoint history retroactively.

### 2. Vote Buying / Bribery

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| Category | Collusion |
| ADR Reference | None |

**Description**: Voters accept off-chain payment to vote a certain way on a proposal. The vote appears legitimate on-chain but represents outside compensation.

**Attack Scenario**:
1. Rich attacker posts on Telegram/Discord: "Vote YES on proposal #42, will pay 1000 XLM per vote"
2. Voters comply, vote appears on-chain
3. Attacker sends payment off-chain
4. On-chain governance shows passing vote with no way to detect coercion

**Mitigation**: Transparent on-chain receipts and reason storage. The governor stores vote reasons (`reason` field in vote recording). Post-factum analysis can detect unusual voting patterns. However, off-chain coordination is inherently undetectable.

**Residual Risk**: Completely undetectable. The blockchain cannot distinguish between a vote cast because someone was paid versus a vote cast conviction. Economic simulation shows vote buying is only profitable at very small scales unless the bribe payer has large capital.

### 3. Guardian Capture

| Attribute | Value |
|-----------|-------|
| Severity | High |
| Category | Access control |
| ADR Reference | None |

**Description**: The guardian address has special privileges (e.g., veto power). If compromised, the attacker can halt all governance.

**Attack Scenario**:
1. Attacker compromises guardian's hot wallet or obtains private key
2. Guardian signs a malicious transaction or the attacker uses guardian address to veto all legitimate proposals indefinitely
3. Governance freezes — no new proposals can pass
4. Attacker may then pass proposals targeting treasury drain through the stalled governance

**Mitigation**: Guardian can only *cancel* proposals, not execute them. The `cancel()` function allows the guardian to reject a proposal but cannot directly transfer funds or modify storage. Additionally, the guardian is replaceable via governance proposal — a new guardian can be appointed through normal governance.

**Residual Risk**: A compromised guardian can block *all* proposals indefinitely (denial of service). The community must detect the compromise and submit an emergency proposal to replace the guardian. During this window, no governance progress is possible.

**Emergency Response**: If guardian is compromised:
1. Emergency token holder coordination (off-chain)
2. Proposal to replace guardian with new address
3. Requires normal quorum and timelock delay

### 4. Timelock Bypass

| Attribute | Value |
|-----------|-------|
| Severity | Critical |
| Category | Execution manipulation |
| ADR Reference | [ADR-003](./adr/adr-003-separate-timelock.md) |

**Description**: An attacker attempts to execute a queued proposal before the mandatory timelock delay elapses.

**Attack Scenario**:
1. Proposal passes with seemingly innocuous calldata
2. Attacker calls `execute()` immediately, bypassing `min_delay`
3. Proposal executes before the community can react
4. Funds transferred or state modified maliciously

**Mitigation**: The timelock enforces a `ready_at` timestamp check. Each proposal records the earliest execution time (`min_delay` ledgers after queue). The `execute()` function checks:

```rust
if env.ledger().sequence() < proposal._ready_at {
    revert("too early");
}
```

**Residual Risk**: Stellar ledger close time manipulation. The ledger sequence determines time. Soroban consensus ensures relatively stable ledger times, but a network partition or consensus failure could affect timing. Stellar's ~5 second ledger close time provides natural jitter that limits precision attacks.

### 5. Upgrade Malice

|Attribute|Value|
|--------|-------|
|Severity|Critical|
|Category|Contract upgrade|
|ADR Reference|[ADR-006](./adr/adr-006-self-governed-upgrades.md)|

**Description**: A malicious contract upgrade (WASM) is passed through governance and executed, giving the attacker full control of the protocol.

**Attack Scenario**:
1. Attacker submits upgrade proposal with malicious WASM (e.g., backdoor in `propose()`)
2. Low participation window — only attackercontrolled accounts vote
3. Quorum is met due to low turnout
4. Proposal passes, executes, protocol now has malicious logic
5. Attacker drains treasury through governance

**Mitigation**: Self-governed upgrades (ADR-006). Upgrades require `env.current_contract_address().require_auth()` — meaning only the governor itself can authorize an upgrade. The upgrade must pass through the full governance process:

1. Proposal creation (subject to `voting_delay`)
2. Voting period (subject to `voting_period`)
3. Queue in timelock (subject to `min_delay`)
4. Execution with full governance auth

Additionally, the guardian has a veto window between queue and execution.

**Residual Risk**: If `quorum_numerator` is set too low, a small coalition can pass an upgrade. With 4% quorum and only 5% participation, an attacker with ~0.3% of tokens can pass anything. Recommendation: Never set quorum below 4% for production.

### 6. Calldata Injection (Open Vulnerability)

| Attribute | Value |
|-----------|-------|
| Severity | Critical |
| Category | Execution manipulation |
| Issue | #215 (tracked) |

**Description**: The timelock's `execute()` function does not forward calldata arguments to the target contract. This limits expressiveness and may cause unintended behavior.

**Attack Scenario**:
1. Proposal contains calldata for a multi-step operation
2. Attacker manipulates execution flow to inject different calldata
3. Proposal executes with incorrect parameters
4. Funds misdirected or state corrupted

**Status**: Open vulnerability, tracked as issue #215.

**Current Mitigation**: None. The timelock currently executes proposals but does not forward custom calldata. This limits the types of proposals that can be executed.

**Required Fix**: Implement calldata forwarding in the timelock's execution path with proper validation.

---

## Severity Ratings

| Rating | Description |
|--------|-------------|
| Critical | Immediate fund loss or protocol compromise possible |
| High | Governance can be DoS'd or manipulated significantly |
| Medium | Individual voters can be exploited; requires additional complexity |
| Low | Difficult to exploit or limited impact |

---

## Accepted Risks

The following risks have been consciously accepted:

| Risk | Rationale |
|------|-----------|
| Vote buying undetectable | Fundamental limitation of on-chain governance; economic analysis shows it's only profitable at small scales |
| Guardian DoS | Acceptable trade-off for emergency control; guardian is replaceable through governance |
| Checkpoint manipulation | Attack requires pre-existing tokens; economic cost outweighs benefit for most attackers |
| Clock manipulation | Stellar consensus provides sufficient ledger stability; no practical exploit known |

---

## Security Considerations

### Parameter Recommendations (see also [parameter-guide.md](../parameter-guide.md))

| Parameter | Safe Value | Rationale |
|-----------|------------|-----------|
| quorum_numerator | 4-10% | Prevents minority capture |
| voting_delay | 1,000-10,000 ledgers | Prevents flash vote attacks |
| voting_period | 50,000-200,000 ledgers | Adequate review time |

### Operational Security

1. **Guardian key management**: Use hardware wallet; rotate after personnel changes
2. **Monitoring**: Watch for unusual proposal patterns
3. **Parameter tuning**: Review settings after major token distribution changes
4. **Upgrade testing**: Always test upgrades on testnet first

---

## References

| Document | Description |
|----------|-------------|
| [SECURITY.md](../../SECURITY.md) | Security vulnerability reporting |
| [parameter-guide.md](../parameter-guide.md) | Parameter tuning recommendations |
| [adr-001-checkpoint-voting-power.md](../adr/adr-001-checkpoint-voting-power.md) | Flash loan mitigation |
| [adr-003-separate-timelock.md](../adr/adr-003-separate-timelock.md) | Timelock design |
| [adr-006-self-governed-upgrades.md](../adr/adr-006-self-governed-upgrades.md) | Upgrade governance |
| [security.md](./security.md) | Treasury reentrancy analysis |

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-26 | 1.0.0 | Initial draft, pending external review |

---

**External Review Required**: This document requires review by at least one external contributor before merge into main. Contact security researchers or audit firms to review.