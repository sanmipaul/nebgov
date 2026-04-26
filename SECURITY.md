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

## Security Scanning

### Automated Vulnerability Scanning

All JavaScript dependencies are automatically scanned for known vulnerabilities using `pnpm audit` in our CI pipeline. The scan runs on every pull request and push to main, covering all workspaces:

- `sdk/` - TypeScript SDK
- `app/` - Next.js frontend  
- `packages/indexer/` - Event indexer API
- `backend/` - Backend services (if present)

### Handling False Positives

If a vulnerability is flagged that doesn't apply to our usage or is a false positive, you can suppress it using one of these methods:

#### Method 1: Using .npmrc (Recommended)
Create or update `.npmrc` in the workspace root:
```
audit-level=high
```

#### Method 2: Package.json Overrides
Add to the root `package.json`:
```json
{
  "pnpm": {
    "auditConfig": {
      "ignoreCves": ["CVE-2023-XXXXX"]
    }
  }
}
```

#### Method 3: Temporary Bypass
For temporary issues during development:
```bash
pnpm audit --audit-level=high --ignore-registry-errors
```

### Severity Levels

- **Critical/High**: Blocks CI and prevents merging
- **Moderate/Low**: Reported but doesn't block CI
- **Info**: Logged for awareness only

When suppressing vulnerabilities, document the reasoning in the commit message and consider creating a GitHub issue to track the decision.
