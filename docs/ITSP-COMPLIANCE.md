# Trial Work vs ITSP 11.0 & 12.0 — compliance mapping

Prepared for the IT meeting, in response to feedback from the head of IT
(22 Aug 2026). Sources: ITSP 11.0 *Software Development and Acquisition
Standard* v2.0 (Jan 2026) and ITSP 12.0 *Cryptography Standard* v2.0
(Jan 2026), both read in full. Neither standard uses clause numbers;
references below are to their section headings.

Verdicts: ✅ compliant today · 🔧 action identified (owner noted) · 🤝 needs IT
(their process or a CIO decision).

---

## 0. The four feedback points, answered

| IT's point | Response |
|---|---|
| **Azure, not AWS** | Agreed as the destination. The apps are static files (move to Azure Static Web Apps trivially). The database is plain PostgreSQL — schema and row-level security port to Azure Database for PostgreSQL unchanged. What gets *rebuilt* rather than moved: auth (→ Entra ID, which also solves staff SSO), the REST layer (→ a thin Azure Functions/Container Apps API using managed identities), photo storage (→ Blob Storage). Proposal: current Sydney Supabase continues as the **time-boxed pilot environment** (risk-assessed + CIO-approved per both standards' exception process) while the Azure build is planned and executed with IT. |
| **ITSP 11.0** | Mapping below. Strong on source control, CI, testing, secure coding posture; genuine gaps are environments separation, formal change control, ASVS assessment, pen test, second-reviewer arrangement, and repo ownership — every one has an action attached. |
| **ITSP 12.0** | Mapping below. No custom cryptography anywhere in the system (deliberate); TLS 1.3 end-to-end; AES-256 at rest platform-managed. Actions: secrets into 1Password per the standard; certificate class (EV for external sites) needs IT's cert process or an exception; data classification to be agreed. |
| **Customer portal is the single front door for customers** | Agreed, and it fits the design: grower/rep roles exist in the schema but are **not enabled** — the pilot is internal staff only, invitation-only. When customer-facing access comes (grower walk-mode, shared reports), it will authenticate via the customer portal identity as the jump point from agnvet.com.au; the trials system presents as a service behind it. No local customer accounts will be created. |

---

## 1. ITSP 11.0 mapping

### Where we stand well

| Standard (heading) | Requirement | Trial Work |
|---|---|---|
| Secure Development | Source code owned by AGnVET, in a controlled repo (e.g. GitHub), restricted access | ✅/🤝 GitHub already; **transfer from personal account to an AGnVET GitHub organisation** is on the meeting ask list — the standard makes it a requirement, not a preference |
| Secure Development | Injection flaws — parameterised queries | ✅ No SQL is constructed anywhere in the clients; all data access is PostgREST with database-enforced row-level security |
| Secure Development | XSS | ✅ React auto-escaping throughout; zero `innerHTML`/`dangerouslySetInnerHTML` in either app (verified by scan). One hardening item: the client-side print/report generator interpolates trial text into its own print window — self-contained and same-origin, but escaping will be added (🔧 dev) |
| Secure Development | CSRF | ✅ Token-bearer auth, no cookie-based sessions — the CSRF vector doesn't exist |
| Secure Development | Improper error handling / information leakage | ✅ Clients show generic failure messages; no stack traces or internals surfaced |
| Secure Development | Cardholder data | ✅ N/A — the system holds no payment data |
| API Security | Least-privilege access, keys stored securely, no plaintext credentials committed | ✅ The only key in the clients is the *publishable* key, privileged to nothing (RLS is the control — by design, documented). No secret credentials exist in the repo (verified by scan). 🔧 The database admin password moves into AGnVET 1Password |
| DevSecOps & CI/CD | Automated testing integrated into CI/CD | ✅ 65 automated checks + type-checking + both builds run on every push; deploys only on green |
| Development Tools | Current toolsets | ✅ Current TypeScript/Node/Vite, dependencies pinned by lockfile |
| Documentation | Comprehensive specs maintained through life | ✅ largely — architecture, backend, runbooks and handoff docs live in the repo; 🔧 add a data-flow diagram and security configuration guide (the standard names both) |
| Licensing | Adequately licensed | ✅ Open-source (MIT-class) toolchain; APVMA data under CC-BY with attribution displayed; fonts under SIL OFL with licence shipped |

### Genuine gaps → actions

| Standard (heading) | Requirement | Gap and action |
|---|---|---|
| Developer Environment / Separation | Separate test/dev environment; no test data in production | 🔧 One environment today. Action: staging deployment + separate database project; **remove the demo trial from production once a real trial replaces it** (the standard's "remove test data before production" clause). Mock data story is strong — the app's offline demo mode is precisely mock-data testing |
| Secure Development | **OWASP ASVS mandatory for all web apps** | 🔧🤝 No ASVS assessment done. Action: run an ASVS Level 1 self-assessment and review it with IT; agree the target level |
| Secure Development | Annual pen test; pen test before major releases | 🤝 None done (declared in the briefing pack). Ask IT to scope one — small attack surface: two static apps + one API |
| Development Lifecycle / Code Review | Second developer reviews all new/changed code | 🔧🤝 Sole developer today. Propose: IT nominates a reviewer for production-bound changes, extent risk-based per the standard's own provision; interim: AI-assisted review + full test gate documented |
| DevSecOps & CI/CD | Secrets scanning, SAST/SCA in pipeline | 🔧 Quick win: enable GitHub secret scanning, Dependabot (SCA) and CodeQL (SAST) — free on the repo, can be on this week |
| Change Management | Formal change control before production changes | 🤝 Adopt AGnVET's change process for production deploys once the system is under IT governance — the CI gate becomes the technical control inside their process |
| Lifecycle / Approval | Project methodology, risk assessment, CIO approval | 🤝 This meeting starts exactly that. Risk assessment of the pilot + CIO sign-off is the standard's own path for where we are |
| Use of Externally Delivered IT Services | Risk assessment + CIO approval for external hosting/storage | 🤝 Supabase (pilot) needs this retrospectively; the Azure migration then brings hosting inside the tenancy and closes it |

## 2. ITSP 12.0 mapping

| Standard (heading) | Requirement | Trial Work |
|---|---|---|
| High Level Guidance | Cloud-hosted + Sensitive/Confidential ⇒ encrypt at rest and in transit | ✅ TLS 1.3 on every connection; AES-256 at rest (platform-managed). 🤝 Agree the data classification with IT (cooperator names/contacts likely *Sensitive*) — already encrypted either way |
| Hashing / Algorithms | SHA-2/3 only; MD5 & SHA-1 banned; AES-128+ no ECB; RSA/DH ≥2048; EC ≥256 | ✅ No custom cryptography exists in the system — all crypto is platform TLS/storage. (One non-cryptographic hash generates sync row identifiers; it is not a security function and is documented as such) |
| Key Management / Storage | Keys in a password manager (1Password named); rotation reviews; custodian control | ✅/🔧 We hold **no** encryption keys (all platform-managed). Secrets we do hold (database admin password, future service credentials) 🔧 move into AGnVET 1Password; annual review then trivial |
| Communication Protocols | TLS 1.2+, 1.3 preferred | ✅ TLS 1.3 |
| SSL Website Certificates | **Externally accessible sites: EV certificate, ≤2y validity** | 🤝 Gap by circumstance: GitHub Pages (and Azure Static Web Apps managed certs) issue DV certificates — EV is not available on either. Needs IT's certificate process on the custom domain, or a CIO risk-assessment exception (the standard's own mechanism). Worth IT's steer — most modern static hosts are DV-only |
| SaaS and Third Party Vendors | TLS 1.2+; independent attestation; customer-managed keys preferable; crypto review at onboarding | ✅ Supabase: TLS 1.3, SOC 2 Type II attestation available; customer-managed keys not offered on our tier ("preferable", not required). This meeting = the onboarding review. Post-Azure this clause retires |
| Exceptions | Risk assessment + CIO approval | 🤝 The mechanism for the pilot-on-Supabase window and the EV-certificate question |

## 3. Proposed sequence

1. **This week (dev):** ~~CodeQL workflow + Dependabot config committed; print-view
   escaping done; ASVS L1 draft self-assessment written
   ([`ASVS-L1-ASSESSMENT.md`](ASVS-L1-ASSESSMENT.md)); security configuration
   guide + data-flow diagram written ([`SECURITY.md`](SECURITY.md)); new-password
   minimum raised to 12 characters~~ **done 22 Aug**. Remaining hands-on:
   database password into 1Password; repo Settings → Advanced Security → confirm
   secret-scanning push protection + Dependabot alerts toggles; Supabase Auth →
   set minimum password length 12 + enable leaked-password protection.
2. **At the meeting:** agree data classification; agree pilot exception (risk assessment + CIO approval) for the Sydney Supabase environment with an end date; agree the Azure target architecture (Static Web Apps + Azure Database for PostgreSQL + Entra ID + Functions/Container Apps with managed identities + Blob Storage + Key Vault); AGnVET GitHub org for the repo transfer; nominate a code reviewer; scope ASVS assessment and pen test; put production deploys under change management.
3. **Then:** build the Azure environment with IT as a project under their methodology — which simultaneously satisfies the environments-separation requirement (Azure = production, current setup retires or becomes staging).
