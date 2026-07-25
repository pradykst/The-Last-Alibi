# B3 cinematic UI boundaries

## Scope

B3 owns the browser presentation and UI-level orchestration for **The Last Exhibit**:

- cinematic opening, title, case briefing, menu, settings, and mode selection;
- fixture session preparation, validated local resume, and transition into the museum;
- museum map, room scenes, witness presentation, notebook, Warrant Desk, accusation, and verdict;
- loading, pending, unavailable, denied, failed, success, and loss presentation;
- responsive layout, keyboard interaction, focus handling, and reduced motion.

B3 does not own case truth, candidate or predicate semantics, proof logic, partner adapters,
credentials, deployments, or canonical state.

## Public evidence classes

The notebook keeps four classes structurally distinct:

| Class                | UI marker                                                         | Candidate effect                               | B3 source                                                   |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| Public observation   | diamond marker and `Public observation` label                     | None                                           | Existing public room manifest and collected observation IDs |
| Unverified testimony | quotation marker, dashed shape, and `Unverified testimony` label  | None                                           | Existing scripted fixture testimony                         |
| Certified disclosure | check marker, double-line shape, and `Certified disclosure` label | Only after the existing warrant API accepts it | Existing public certified-disclosure entries                |
| Player hypothesis    | question marker and `Working hypothesis` label                    | None until terminal submission                 | Local form state                                            |

Testimony never updates the candidate count or candidate mask. B3 does not infer certification from
appearance, narrative tone, or a partner name.

## Runtime behavior

### Fixture

- `Practice Investigation` is available.
- Session creation uses the existing fixture session route.
- A resumable session is offered only after its saved session ID is validated through the existing
  session route and the public session remains active.
- Scripted testimony is labelled unverified and fixture-backed.
- Disclosure receipts are labelled `Fixture certified simulation`.
- Commitments are labelled `Local fixture commitment`.
- Verdicts are binary only and never reveal the hidden case after `NO`.
- Refresh can restore an active in-memory fixture session while the server process still owns it.

### Live

- Live game routes remain fail closed.
- `Practice Investigation` is not silently enabled in a live runtime.
- `Ranked Agent` is unavailable until the complete live capability exists.
- No fixture session, fixture testimony, fixture commitment, or fixture disclosure is substituted.
- Pending, failed, unavailable, and denied states must remain blocking until confirmed public live
  contracts say otherwise.

## Technical metadata policy

The optional technical drawer renders only values already exposed by the public session:

- runtime label;
- fixture session identifier;
- candidate count;
- local fixture commitment and status;
- fixture disclosure state.

It explicitly does not fabricate transaction hashes, explorer links, package or object IDs, proof
receipts, provider addresses, 0G response IDs, Walrus blob IDs, Seal release state, World
eligibility, or onchain confirmation.

## S1 integration seam

After S1 merges, keep the B3 screen and evidence components presentation-only. Wire a narrow public
session adapter that maps confirmed S1 state into:

1. canonical session state and session identifier;
2. public candidate count;
3. disclosure budget and registered predicate statuses;
4. action-pending state and sanitized denials;
5. real commitment label and public identifier;
6. confirmed terminal result access state.

Do not map a submitted transaction to `confirmed`. Warrant and accusation presentation must remain
pending until the S1-defined canonical confirmation/finality boundary is satisfied. Do not move
predicate generation, safety preview, candidate-mask transitions, or replay protection into B3.

## G1 integration seam

After G1 merges, replace only the fixture testimony request adapter. Preserve:

1. the exact `Unverified testimony` class until G1 returns the public verified state required by its
   contract;
2. explicit pending, verification-failed, unavailable, and denied UI states;
3. no candidate effect from testimony;
4. no hidden-case input or output;
5. real response identifiers only when G1 exposes them as public sanitized metadata.

Do not render text from an unverified live response as if verification succeeded. Never fall back to
scripted fixture testimony in live mode.

## Missing asset slots

No approved raster, vector, video, or audio assets are tracked at B3. CSS-backed room architecture,
lighting, character silhouettes, and evidence marks keep every screen functional without artwork.
Future user assets can fill these stable slots without changing gameplay:

- product wordmark or logo;
- Grand Gallery wide scene;
- Restoration Lab wide scene;
- Archive Vault wide scene;
- Rooftop Conservatory wide scene;
- portrait or character-focus art for Ada Vale, Marcus Reed, Celeste Moreau, and Theo Lin;
- optional title ambience, room ambience, UI confirmation, and verdict audio.

Artwork must remain decorative and must not encode the canonical solution. Audio must remain
user-controlled, pause or reduce while the document is hidden, and preserve silent operation.

## Final integration demonstration

The integrated build must demonstrate:

- opening skip and reduced-motion entry;
- honest mode availability;
- session preparing, committing, confirmed, failed, and resume states;
- every room and witness;
- empty and populated notebook;
- testimony pending, verified-or-unverified as contractually correct, and verification failure;
- warrant safe, implied, unavailable, pending, confirmed, and denied;
- terminal accusation confirmation and duplicate-submit prevention;
- verdict access pending, verdict verification failure, `YES`, and `NO` without solution disclosure;
- technical metadata with only real identifiers;
- desktop, laptop, tablet, and mobile layouts.
