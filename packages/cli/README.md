# @nebgov/cli

Terminal CLI for NebGov governance operations.

## Install

```bash
pnpm --filter @nebgov/cli build
pnpm --filter @nebgov/cli link --global
```

Then run:

```bash
nebgov --help
```

## Configuration

The CLI reads config from:

1. Environment variables
2. `~/.nebgov/config.json` (or `--config <path>`)

Supported env vars:

- `NEBGOV_NETWORK` (`testnet` | `mainnet` | `futurenet`)
- `NEBGOV_GOVERNOR_ADDRESS`
- `NEBGOV_TIMELOCK_ADDRESS`
- `NEBGOV_VOTES_ADDRESS`
- `NEBGOV_TREASURY_ADDRESS`
- `NEBGOV_RPC_URL`
- `NEBGOV_KEYPAIR_FILE`
- `NEBGOV_DEFAULT_ACCOUNT`

Example config file:

```json
{
  "network": "testnet",
  "governorAddress": "C...",
  "timelockAddress": "C...",
  "votesAddress": "C...",
  "treasuryAddress": "C...",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "keypairFile": "~/.stellar/keypair.json",
  "defaultAccount": "G..."
}
```

## Output Modes

- Default: JSON
- `--human`: human-friendly output
- `--dry-run`: print planned action without submitting transactions

## Commands

### Proposals

```bash
nebgov proposals list --proposer G...
nebgov proposals get 42
nebgov proposals create \
  --title "Q2 Budget Update" \
  --description-file ./proposal.md \
  --target C... \
  --fn update_config \
  --keypair ~/.stellar/keypair.json
```

### Voting

```bash
nebgov vote cast 42 for --keypair ~/.stellar/keypair.json
nebgov vote status 42 --voter G...
```

### Delegation

```bash
nebgov delegate to G... --keypair ~/.stellar/keypair.json
nebgov delegate show G...
```

### Treasury

```bash
nebgov treasury balance --viewer G...
nebgov treasury batch-transfer \
  --token C... \
  --recipients ./recipients.csv \
  --keypair ~/.stellar/keypair.json
```

`recipients.csv` format:

```csv
GAAAA...,1000000
GBBBB...,2500000
```
