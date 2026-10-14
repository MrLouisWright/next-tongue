# Security policy

## Supported versions
next-tongue is pre-alpha and **no version has been published**. Once releases exist, the latest minor of the latest major receives security fixes.

| Version | Supported |
|---|---|
| unreleased (`main`) | ✅ best effort |

## Reporting a vulnerability
Please **do not open a public issue.** Use GitHub's [private vulnerability reporting](https://github.com/MrLouisWright/next-tongue/security/advisories/new). You'll get an acknowledgement within 7 days and a fix or mitigation plan within 30 days for confirmed issues. Credit is given in the advisory unless you prefer otherwise.

## Scope of particular interest
- `proxy.ts` handling: open redirects, header/cookie injection, locale spoofing.
- Build-time compiler: code injection via message content into generated modules (messages are escaped; any bypass is critical).
- `tongue translate`: API key leakage (logs, lockfile, errors), prompt injection from message content that causes writes outside `messages/`.
- Codemods writing outside the project directory.
