# OWASP ASVS Level 1 — draft self-assessment

Draft for review with IT, per ITSP 11.0's mandatory-ASVS clause. Assessed
against ASVS 4.0 at Level 1, category by category, for both web apps and the
API. This is a self-assessment by the developer, not an independent
verification — its purpose is to agree scope and target level with IT and
seed their review. ✅ met · ⚠️ partial (action noted) · ❌ gap (action noted)
· n/a with reason.

| ASVS chapter | Verdict | Notes |
|---|---|---|
| V1 Architecture | ✅ (L1 scope) | Documented architecture and data flow (`SECURITY.md`); trust boundaries identified; security controls enforced server-side (RLS in the database, not the client) |
| V2 Authentication | ⚠️ | Delegated to Supabase Auth (bcrypt, basic rate limiting, no default credentials). **Gap: minimum password length is 6; ASVS 2.1.1 requires 12** → raise to 12 in the Auth settings and the two apps. Breached-password screening available on the platform — enable. MFA is an L2 concern; arrives naturally with Entra ID |
| V3 Session management | ⚠️ | Short-lived JWTs (1 h) with refresh rotation; sign-out clears the session on device. **Accepted risk to record:** tokens live in `localStorage` (no cookies → no CSRF; XSS surface verified nil). Revisit under the Azure/Entra design |
| V4 Access control | ⚠️ | Org-level isolation enforced in the database (deny-by-default RLS; no client-side-only checks; no direct-object-reference exposure — ids are UUIDs behind org policies). **Known gap: per-role restrictions (admin vs team etc.) defined but not yet enforced in policies** — scheduled before any non-agronomist users |
| V5 Validation & encoding | ✅ | No SQL construction (parameterised PostgREST); React output encoding + escaped print views; numeric input caps at entry; file parsers operate on the user's own files, client-side, in a memory-safe runtime |
| V6 Stored cryptography | ✅ | No custom cryptography; platform AES-256 at rest; no MD5/SHA-1; the non-cryptographic row-id hash documented as not a security function |
| V7 Error handling & logging | ⚠️ | Generic user-facing errors, no internals leaked. **Gap: minimal security event logging** — auth events exist in Supabase's logs but aren't reviewed; sync operations logged (`sync_log`). Action: define a log-review expectation with IT; richer audit is native in the Azure design |
| V8 Data protection | ✅/⚠️ | Sensitive data inventory documented; offline caching of trial data on phones is the product's core design, documented, with platform disk encryption on modern devices. Sync-before-leaving procedure noted for lost-device exposure; remote wipe is the MDM answer (device policy question with IT) |
| V9 Communication | ✅ | TLS 1.3 on every connection; HSTS on API and hosting domains; no mixed content; no plaintext fallback |
| V10 Malicious code | ✅ | Dependency surface deliberately tiny (2 runtime deps); lockfile-pinned; Dependabot + CodeQL + secret scanning in the pipeline; no analytics/telemetry/third-party scripts |
| V11 Business logic | ✅ (L1 scope) | Idempotent sync (replays safe); corrections append-only with audit trail; approval flow gates trial changes |
| V12 Files & resources | ✅ | Uploads: photo blobs stay on-device (metadata only syncs today); bucket policies org-partition future uploads with no public access and no delete policy; parsed documents are the user's own files processed locally |
| V13 API & web services | ✅/⚠️ | REST under RLS; least-privilege anonymous key; strict schemas enforced by PostgREST; platform rate limiting. WAF/API-gateway hardening (ITSP 11 API clause) lands with the Azure design (Front Door / APIM) |
| V14 Configuration | ⚠️ | Builds pinned and reproducible; no debug modes in production; no secrets in config. **Gap: no CSP / security headers — GitHub Pages cannot set custom response headers at all.** Azure Static Web Apps can → becomes another concrete reason for the agreed migration |

## Actions arising (in order)

1. **Raise minimum password length to 12** (Auth settings + both apps) and
   enable breached-password screening — closes the only V2 L1 miss.
2. **Role-enforcing RLS policies** before any non-agronomist account exists.
3. **Security headers/CSP** — delivered by the Azure Static Web Apps move.
4. **Log review expectation** agreed with IT (interim: Supabase auth logs).
5. Independent check of this self-assessment by IT's nominated reviewer.
