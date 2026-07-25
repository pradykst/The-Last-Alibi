# The Last Alibi trust boundaries

## Purpose

This document defines the intended authority boundaries for The Last Alibi, a browser-based AI detective game for ETHGlobal Lisbon 2026. It is an architecture contract: components may assist, store, prove, authorize, or present, but only the designated authority may decide each fact.

The core rule is simple:

> The language model is never authoritative over the hidden case, canonical evidence, candidate elimination, disclosure limits, proof validity, ranked eligibility, or the final verdict.

The diagrams in this directory describe intended architecture, not deployed reality. They must be revalidated against the implemented contracts, circuits, services, partner integrations, and production configuration before submission.

## Evidence basis

The following boundaries are grounded in the documentation bundled with the pinned sui-pilot development tooling:

- Sui Move exposes Groth16 verification for BN254 and BLS12-381, while the application remains responsible for pinning or verifiably identifying the expected verification key: `.tools/sui-pilot/.sui-docs/develop/cryptography/groth16.mdx`.
- Walrus provides public data availability and integrity, not confidentiality; private material must be encrypted before upload and blob IDs must be treated as public: `.tools/sui-pilot/.walrus-docs/data-security.mdx`.
- Seal uses client-side encryption and Sui-defined Move access policy evaluated by off-chain key servers: `.tools/sui-pilot/.seal-docs/Design.mdx` and `.tools/sui-pilot/.seal-docs/index.mdx`.
- Finalized Sui checkpoints are the intended read boundary for release-sensitive events: `.tools/sui-pilot/.sui-docs/develop/accessing-data/using-events.mdx`.

The exact game rules, 0G boundary, World AgentKit boundary, object names, proof statements, and five-warrant disclosure cap are checkpoint D1 product requirements. They are not claims that a partner integration or deployed implementation already exists.

## Component authority matrix

| Component | Authoritative for | Not authoritative for |
|---|---|---|
| Sui Move | Canonical game state; case and accusation commitments; candidate-mask transitions; disclosure authorization and count; expected verifier identity; native proof acceptance; session and nonce replay protection; ranked permits; terminal accusation state; verdict commitment and recorded blob reference | Private witness generation; suspect dialogue; plaintext case or accusation; ciphertext confidentiality; UI rendering |
| Native Sui Groth16 verification | Cryptographic acceptance or rejection of a proof against the expected prepared verification key and bound public inputs | Choosing the statement, policy, hidden case, candidate mask, or verdict |
| Private proof service / ZK prover | Processing private witnesses and generating proofs for the registered statements | Policy, disclosure safety, replay decisions, canonical state, ranked eligibility, or final verdict authority |
| 0G verified suspect inference | Planned verified execution of bounded suspect-agent inference over permitted context | Hidden case; canonical evidence; candidate elimination; disclosure authorization; proof validity; verdict |
| Walrus | Persistence and availability of uploaded ciphertext bytes | Confidentiality; access authorization; plaintext truth; proof validity; canonical blob association |
| Seal | Releasing decryption material when the Sui-defined policy approves the requested identity | Plaintext truthfulness; game outcome; proof validity; Walrus integrity; canonical state |
| World AgentKit | Human-backed authorization for one scarce Ranked Agent attempt | Game outcome; evidence; candidate transitions; disclosure; proof validity; verdict |
| Game API / relayer | Orchestration; idempotency; proof jobs; transaction submission; finality waiting; permit handling | Unilateral case selection; proof acceptance; canonical transitions; ranked eligibility; verdict |
| Game web application | Presentation; input collection; local interaction state; client-side commitment and capsule checks | Case truth; proof validity; canonical state; disclosure authority; ranked eligibility; verdict |

## Data classification

| Class | Examples | Handling rule |
|---|---|---|
| Public | Level identifier and protocol version; registered typed-predicate identifiers; public candidate count; commitments; transaction effects; Walrus blob reference; ciphertext | May be displayed or transported, but public data is not automatically canonical unless Sui records it |
| Private | Hidden case and commitment opening; accusation plaintext and salt; prover witnesses; unencrypted verdict capsule; local decryption material | Never send to 0G, Walrus in plaintext, or Sui in plaintext; minimize lifetime and exposure |
| Encrypted | Verdict capsule ciphertext stored on Walrus | Treat blob ID and ciphertext as public; confidentiality depends on authenticated encryption and Seal-controlled key release |
| Proof-bound | Case commitment; registered typed predicate; result bit; accusation commitment; session; query or attempt nonce; verdict commitment | Encode unambiguously as circuit public inputs and verify against the expected verifier identity |
| Canonical onchain state | `LevelConfig`, `GameSession`, `PendingQuery`, `RankedPermit`, `VerdictRecord`, candidate mask, disclosure count, terminal state | Only valid Sui Move transitions may mutate it; services and UI must reconcile to confirmed state |
| Public but non-canonical | Suspect testimony and other 0G inference output | May shape the investigation experience but must never mutate the canonical candidate mask or settle truth |

## Certified-warrant trust flow

1. The player selects a registered binary warrant.
2. The web application sends the session, typed predicate, and nonce to the API.
3. The API asks Sui Move to authorize a `PendingQuery`.
4. Sui rejects unless the predicate is known, no action is pending, the predicate is unused, fewer than five disclosures have occurred, both non-empty branches retain at least two candidates, and the session and nonce are correct.
5. Only after safe authorization does the prover privately evaluate the committed hidden case.
6. The proof binds the case commitment, registered typed predicate, result bit, session, and query nonce.
7. The relayer submits the proof-backed transition.
8. Sui invokes native Groth16 verification using the expected verifier identity and updates canonical state only on success.
9. The API waits for confirmed execution and the configured finality boundary.
10. Only then may the web render certified `YES` or `NO` and the confirmed candidate count.

Informal testimony is outside this transition and cannot change the candidate mask.

## Accusation and verdict trust flow

1. The player selects suspect, room, weapon, and time.
2. The browser salts and commits those fields without publishing their plaintext onchain.
3. The prover privately evaluates the accusation against the committed hidden case.
4. The proof binds the case commitment, accusation commitment, session, attempt nonce, and verdict commitment.
5. The verdict capsule contains only the binary result and the minimum commitment-opening data required by the client.
6. The capsule is authenticated and encrypted before storage.
7. Walrus stores only the ciphertext and returns a public blob reference.
8. The relayer submits the proof, verdict commitment, and blob reference.
9. Sui verifies the proof and records terminal canonical state.
10. Seal evaluates the Sui-defined policy for the correct player, terminal session, matching blob and commitment, and correct protocol and level version.
11. The authorized player receives decryption material and decrypts locally.
12. The client validates capsule version, session, nonce, and verdict commitment opening.
13. The client renders only `YES` or `NO`.

The capsule does not become true because it decrypted successfully. Its commitment opening must match the canonical `VerdictRecord`.

## Live-mode fail-closed rules

The live system must withhold disclosure or verdict release when any of the following occurs:

- the typed predicate is unknown, used, unsafe, or would be a sixth disclosure;
- a session, query nonce, attempt nonce, commitment, protocol version, or level version does not match;
- a previous query or accusation is still pending;
- a proof is malformed, invalid, bound to different public inputs, or verified under an unexpected key;
- transaction execution fails, is not confirmed, or has not reached the configured finality boundary;
- a proof job, relayer submission, 0G request, Walrus write/read, or Seal request times out or returns ambiguous state;
- the requesting player is unauthorized or the session is not terminal;
- the Walrus blob reference differs from canonical state;
- authenticated ciphertext is modified or cannot be decrypted;
- the verdict commitment opening is incorrect;
- the client cannot reconcile the response with current canonical Sui state.

Retries must be idempotent. A timeout is not permission to disclose, repeat a canonical transition, or infer success.

## Threat assumptions

- The language model may hallucinate, manipulate, collude, or receive adversarial prompts. Its output remains non-canonical.
- The API or relayer may censor, delay, reorder, duplicate, or fabricate requests. Correct Move checks and nonces must prevent unilateral canonical changes.
- A prover may return an invalid proof. Sound verification under the expected key and exact public-input encoding must reject it.
- Circuit bugs, ambiguous encodings, or a compromised setup can invalidate proof-system guarantees even when verification returns true.
- Walrus content is public. Privacy depends on encrypting before upload; blob IDs provide no secrecy.
- Seal confidentiality depends on correct Move policy, key-server integrity, threshold selection, client handling, and package-upgrade governance.
- World AgentKit authorization can establish only the permitted human-backed ranked attempt, not correctness of game actions or outcome.
- 0G verification can attest only to the configured inference execution boundary; it cannot make model output true or canonical.
- A compromised web client can misrender local state. Players and auditors must be able to reconcile important outcomes with canonical Sui records and commitment checks.
- Finality and availability failures may delay the game. They must not weaken authorization or disclosure rules.

## Groth16 parameter status

Groth16 requires a circuit-specific trusted setup. Any deterministic, locally generated, example, or test proving and verification parameters are **non-production**. Production use requires a suitable setup process and an immutable or verifiably identified expected verification key bound into the Sui policy. Until that exists, diagrams and tests may describe the proof flow but must not claim production cryptographic security.

## Diagram rendering provenance

The `.mmd` files are the canonical editable sources. At checkpoint D1, no local Mermaid CLI or parser was available without installing another dependency. The accompanying SVGs were therefore authored as standards-compliant, accessible exports that match the reviewed Mermaid flows. Mermaid syntax received structural review only; it was not validated by the official Mermaid parser. Future edits should render the `.mmd` sources with a pinned renderer and compare every authority edge before replacing the SVGs.

## Revalidation requirement

Before hackathon submission, revalidate these boundaries against:

- deployed Move package source, object layouts, package address, and upgrade policy;
- circuit source, public-input encoding, setup transcript, proving key, and expected verification key;
- API idempotency and finality configuration;
- live 0G, World AgentKit, Walrus, and Seal behavior and receipts;
- client-side encryption, capsule validation, and failure handling.

Any deployed deviation must update this document and all three diagrams before it is presented as the system architecture.
