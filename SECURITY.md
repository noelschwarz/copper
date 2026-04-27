# Security policy

Thanks for taking the time to disclose responsibly.

## Reporting a vulnerability

If you believe you've found a security issue in Aloy — anywhere from the SDK shipped to npm to the self-hosted server image — email **noel@aloy.dev** with a description, the affected version, and a proof-of-concept if you have one. Please do **not** open a public issue, post to social media, or otherwise disclose until we have responded.

We will acknowledge receipt within **3 business days** and aim to land a fix within **30 days** for severe issues. We will credit you in the release notes unless you ask us not to.

## Supported versions

Aloy is pre-1.0. We support security fixes on the latest minor release only:

| Version | Supported          |
| ------- | ------------------ |
| `0.1.x` | :white_check_mark: |
| `< 0.1` | :x:                |

Older `0.x.y` lines may receive backports for serious issues at our discretion. Once we hit `1.0` this policy gets a longer support window.

## Scope

In scope:

- Vulnerabilities in the `aloy` npm package (the SDK).
- Vulnerabilities in the `apps/api` server (Hono routes, Drizzle queries, the auth middleware, the admin CLI).
- Vulnerabilities in the supplied `docker-compose.yaml` and `Dockerfile`.

Out of scope (please don't report these):

- Issues that require a privileged user on the same machine.
- DoS by sending arbitrarily large payloads — we have a 500-event batch cap and rely on operators to set sensible reverse-proxy limits.
- Lack of features that are not yet implemented (the policy engine, the dashboard, etc.).

## Handling secrets

The SDK includes a built-in redactor that scrubs common API key shapes, PII, and high-entropy tokens *in-process* before events leave the user's machine. **The redactor is best-effort, not perfect.** Treat the Aloy server as containing potentially-sensitive data and protect it accordingly.

If you've accidentally shipped real secrets to a self-hosted Aloy instance you control, the right move is to rotate the secrets first, then delete the events:

```sql
DELETE FROM events WHERE id IN (...);
```

If you've shipped real secrets to a hosted Aloy instance we operate, email us at **noel@aloy.dev** and we will take it from there.
