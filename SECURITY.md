# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in NebGov, please report it responsibly. **Do not open a public GitHub issue.**

### How to Report

1. Go to [GitHub Security Advisories](https://github.com/nebgov/nebgov/security/advisories/new)
2. Click "Report a vulnerability"
3. Fill in the details of the vulnerability
4. Submit the report

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Affected component (contract, SDK, frontend)
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix and disclosure**: Coordinated with the reporter

### Scope

The following components are in scope:

| Component | Repository Path |
|-----------|----------------|
| Governor Contract | `contracts/governor` |
| Timelock Contract | `contracts/timelock` |
| Token Votes Contract | `contracts/token-votes` |
| Governor Factory | `contracts/governor-factory` |
| Treasury Contract | `contracts/treasury` |
| TypeScript SDK | `sdk/` |

The frontend (`app/`) is lower priority but still in scope.

### Out of Scope

- Issues in third-party dependencies (report upstream)
- Testnet-only issues with no mainnet impact
- Social engineering or phishing

## Supported Versions

| Version | Supported |
|---------|-----------|
| main branch | Yes |
| Tagged releases | Yes |
| Older commits | No |
