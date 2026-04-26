# Governance Parameter Tuning Guide for Production DAOs

This guide helps DAO operators choose safe, production-ready values for all 14 GovernorSettings parameters. Setting these incorrectly can make governance unusable (too-high quorum = nothing passes) or dangerous (too-low timelock = no reaction time for attacks).

## Overview

| Warning | Description |
|---------|-------------|
| Too High Quorum | Governance stalls - nothing ever passes |
| Too Low Quorum | Minority capture - small group controls outcomes |
| Too Short Delay | Flash loan governance attacks possible |
| Too Long Delay | Emergency fixes take too long to execute |

**Ledger timing**: Stellar ledgers close approximately every 5 seconds. Use this for time-to-ledger conversions.

## All 14 GovernorSettings Parameters

| # | Parameter | Recommended Range | Too Low Risk | Too High Risk | Notes |
|---|-----------|-----------------|-------------|---------------|-------|
| 1 | `votingDelay` | 1,000-10,000 ledgers | Snapshot gaming, fast attacks | Slow governance response | ~1.4h to ~14h |
| 2 | `votingPeriod` | 50,000-200,000 ledgers | Rushed decisions, missed voters | Voter fatigue, stalled proposals | ~3 to ~12 days |
| 3 | `quorumNumerator` | 4-10% | Minority capture | Governance stalls, nothing passes | % of total supply |
| 4 | `proposalThreshold` | 0.1-1% supply | Spam, low-quality proposals | Only whales can propose | In quote units |
| 5 | `guardian` | Specific address | No emergency controls | Single point of failure | Must be trusted |
| 6 | `voteType` | 0 (Simple) or 1 (Extended) | Limited features | Extra complexity | Use Extended for full features |
| 7 | `proposalGracePeriod` | 10,000-50,000 ledgers | Proposals expire before execution | Slow proposal cleanup | ~1.4h to ~3 days |
| 8 | `useDynamicQuorum` | boolean | Fixed quorum may be too rigid | Community prefers flexibility | Optional |
| 9 | `reflectorOracle` | address or null | No USD floor | Depends on oracle | For dynamic quorum |
| 10 | `minQuorumUsd` | 10,000-100,000 USD | No USD floor protection | Too restrictive | For dynamic quorum |
| 11 | `maxCalldataSize` | 10,000 bytes default | | Large attack surface | Default is fine |
| 12 | `proposalCooldown` | 100-1,000 ledgers | Proposal spam | Slows governance | ~8min to ~1.4h |
| 13 | `maxProposalsPerPeriod` | 3-10 | | | Limits concurrent proposals |
| 14 | `proposalPeriodDuration` | 10,000-50,000 ledgers | Short windows cause congestion | Limits proposal frequency | ~1.4h to ~3 days |

## Ledger to Time Conversion

| Ledgers | Approx Time |
|---------|-------------|
| 100 | 8.3 minutes |
| 1,000 | 1.4 hours |
| 10,000 | 13.9 hours (~14h) |
| 50,000 | 2.9 days (~3 days) |
| 100,000 | 5.8 days (~6 days) |
| 200,000 | 11.6 days (~12 days) |

## Small DAO vs Large DAO Recommendations

**Small DAO** (< $1M TVL, < 100 voters)
- Faster governance, lower barriers
- Focus on participation incentives

**Large DAO** (> $10M TVL, 100+ voters)
- Slower, more deliberate
- Higher thresholds for safety

### Small DAO Preset

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| votingDelay | 1,000 ledgers | ~1.4h - fast proposal kickoff |
| votingPeriod | 50,000 ledgers | ~3 days - adequate review time |
| quorumNumerator | 4% | Low enough to pass, high enough for legitimacy |
| proposalThreshold | 0.1% supply | Low barrier for participation |
| proposalGracePeriod | 10,000 ledgers | ~1.4h to execute |
| proposalCooldown | 100 ledgers | ~8min between proposals |
| maxProposalsPerPeriod | 5 | Prevent spam |
| proposalPeriodDuration | 10,000 ledgers | Open window for proposals |
| useDynamicQuorum | false | Simpler, predictable |
| maxCalldataSize | 10,000 bytes | Default |

### Large DAO Preset

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| votingDelay | 10,000 ledgers | ~14h - time for analysis |
| votingPeriod | 172,800 ledgers | ~10 days - thorough review |
| quorumNumerator | 8% | Higher for legitimacy |
| proposalThreshold | 0.5% supply | Meaningful stake required |
| proposalGracePeriod | 50,000 ledgers | ~3 days - plenty of time |
| proposalCooldown | 1,000 ledgers | ~1.4h cooldown between proposals |
| maxProposalsPerPeriod | 3 | Focus on quality |
| proposalPeriodDuration | 50,000 ledgers | Longer window |
| useDynamicQuorum | true | Adaptive participation |
| minQuorumUsd | 50,000 | USD floor for large DAOs |
| maxCalldataSize | 10,000 bytes | Default |

## Risk Summary by Parameter

### Critical Parameters (Can Break Governance)

| Parameter | Risk if Too Low | Risk if Too High |
|-----------|----------------|----------------|
| quorumNumerator | Minority can pass anything | Governance freezes |
| votingPeriod | Rushed, uninformed voting | Voter fatigue, proposals stall |
| votingDelay | Flash loan attacks | Urgent fixes delayed |

### Security Parameters

| Parameter | Risk if Too Low | Risk if Too High |
|-----------|----------------|----------------|
| proposalThreshold | Proposal spam | Governance captured by whales |
| proposalCooldown | Spam flooding | Legitimate proposals delayed |
| maxCalldataSize | | Larger attack surface |

### Operational Parameters

| Parameter | Risk if Too Low | Risk if Too High |
|-----------|----------------|----------------|
| proposalGracePeriod | Expires before execution | Slow proposal cleanup |
| maxProposalsPerPeriod | | Legitimate proposals rejected |

## How to Apply Changes

Parameters are updated via governance proposal. See [parameter-updates.md](./parameter-updates.md) for step-by-step instructions.

### Quick Summary

1. Build new settings using the SDK
2. Create a proposal with `update_config` calldata
3. Wait for `voting_delay` ledgers
4. Vote during `voting_period` ledgers
5. Queue if passed, execute after timelock
6. A `ConfigUpdated` event is emitted on success

## Emergency Actions

The `guardian` address has emergency powers:
- Cancel stuck proposals
- Emergency parameter adjustments through governance

**Important**: Choose a guardian you trust. If the guardian is compromised, so is your DAO.

## References

- [parameter-updates.md](./parameter-updates.md) - How to update parameters via proposal
- [parameter-guide.md](./parameter-guide.md) - Original tuning guide with attack scenarios
- [events.md](./events.md) - ConfigUpdated event documentation