# Security policy

IMBERE DATA is a read-only decision-support prototype. It has no accounts, no
database, no cookies and no personal data. The API serves published NISR/FinScope
figures and a calibrated synthetic household layer.

## Reporting a problem

Email **mushimiyimanaisaac@gmail.com** with:

- what you found and where (URL, endpoint, or file and line),
- how to reproduce it,
- the impact you think it has.

Please do not open a public issue for a vulnerability. You will get an
acknowledgement within a few days. This is a hackathon prototype maintained by
two people, so there is no formal SLA or bug bounty.

## In scope

- The API (`api/`) and the interface (`web/`).
- The deployed Worker/Container configuration (`deploy/cloudflare/`).
- Committed data under `data/`, including anything that should not be public.

## Out of scope

- Denial of service by volume. The instance is rate-limited and runs on a free
  tier by design.
- Findings that only affect unsupported browsers.
- The synthetic household rows being synthetic. That is documented in
  `README.md`, `docs/METHODOLOGY.md` and every API response that touches them.

## Secrets

No credentials are committed. Runtime configuration is environment variables
(`IMBERE_*` in the API, `NEXT_PUBLIC_API_BASE` in the interface); see
`.env.example`. If you believe a secret has leaked, report it as above rather
than opening an issue.
