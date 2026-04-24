# ADR-008: Treasury execution surface and authorization split

## Status
Accepted

## Context

NebGov treasury operations have two execution paths:

1. Owner-driven M-of-N multi-sig transactions (`submit`/`approve`)
2. Governor-driven batched payouts (`batch_transfer`) executed through timelock

Both paths move treasury funds, but with different trust and timing assumptions.

## Decision

Keep both flows explicitly separated:

- Owner path is for operational treasury management with immediate multi-sig controls
- Governor path is for protocol-level treasury policy controlled by proposal lifecycle and timelock delay

The contract enforces authorization at function boundaries so each path stays isolated.

## Consequences

- Clearer auditability: each transfer path has a distinct event trail
- Better governance guarantees for policy-level disbursements (timelock + proposal vote)
- Operational flexibility retained for owner-managed actions
- Documentation must explain flow differences to avoid misconfiguration

## Alternatives Considered

1. **Single path via governor only**  
   Maximizes governance guarantees but slows emergency/operational transfers.

2. **Single path via multisig only**  
   Simpler operations but loses token-holder governance for treasury policy.
