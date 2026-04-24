# ADR-007: Wrapper withdrawal locking for active voters

## Status
Accepted

## Context

The `token-votes-wrapper` contract allows users to deposit governance tokens and receive voting power. Snapshot voting (see [ADR-001](./adr-001-checkpoint-voting-power.md)) protects against flash-loan voting at proposal start, but it does not fully prevent post-vote exits.

A voter could otherwise:
1. Deposit tokens to gain voting power
2. Cast a vote on an active proposal
3. Withdraw before proposal resolution
4. Reuse the same liquidity elsewhere while their vote remains counted

## Decision

After a vote is recorded, the governor locks wrapper withdrawals for that voter until the proposal voting window ends. Concretely, the governor calls:

`lock_withdrawal(voter, proposal.end_ledger)`

This makes voting power economically sticky through the active voting period.

## Consequences

- Voters who participate in active proposals cannot immediately withdraw wrapped tokens
- Governance outcomes are harder to manipulate with rapid deposit/exit cycling
- UX adds a temporary withdrawal restriction while proposals are active
- The mechanism is deterministic and bounded by proposal end ledger

## Alternatives Considered

1. **No locking (snapshot only)**  
   Keeps UX simple but allows rapid post-vote exits that weaken vote integrity.

2. **Time-weighted voting power**  
   Reduces short-term influence but adds substantial implementation and audit complexity.

## Open Questions

- Should locks support proportional release for partial withdrawals?
- Should lock extensions be capped when many active proposals overlap?
