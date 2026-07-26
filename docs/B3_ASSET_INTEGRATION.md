# B3 approved asset integration

## Scope

B3 owns browser-game presentation and UI orchestration. It does not own candidate masks, hidden
case data, predicate semantics, proof logic, partner adapters, Move packages, or live
authorization. The UI consumes the existing public fixture contracts and keeps live mode
fail-closed.

## Asset pipeline

The 68 approved source masters remain in the ignored `_asset-drop/` working directory. Run:

```text
pnpm assets:build
```

This performs two deterministic steps:

1. `assets:process` validates the source inventory, normalizes approved artwork, writes 64
   canonical runtime assets, copies 5 development references, and refreshes the validation report.
2. `assets:marketing` composes the 1920×1080 ETHGlobal cover and 1200×630 social preview from the
   approved background, logo mark, and wordmark only.

Runtime files live under `apps/web/public/assets/`. Character and style references live under
`design/assets-source/` and are never loaded by the browser. The exhaustive typed mapping is
`apps/web/src/assets/game-assets.ts`.

The generated report in `docs/assets/asset-validation-report.json` records source mappings,
formats, dimensions, hashes, alpha bounds, source repairs, character transforms, and derived
marketing hashes. Its Markdown companion is the readable checkpoint summary.

## Normalization and scene coordinates

- Character emotion sprites use the approved neutral sprite as the per-character authority.
- Visible alpha uses a threshold of 8.
- Every emotion is placed on a transparent 1024×1024 canvas at the same bottom-center anchor.
- Visible height stays within ±2% of neutral; baseline and horizontal center stay within ±2px.
- Room background and foreground layers are normalized to the same 1920×1080 canvas.
- Map and room scene art use `object-fit: contain`; scene artwork is never runtime-covered.
- `scene-coordinates.ts` is the only 1920×1080 design-to-screen transform. Map and room hotspots
  use the same design coordinate space as their art.

The source foregrounds were 1536×1024 while source backgrounds were 1672×941. Direct mixed use
was rejected. Both approved layers were proportionally cover-normalized offline to the shared
runtime canvas; the browser then contains the matched pair.

## UI state boundaries

- Public observations use the observation family and never alter candidate state.
- Scripted fixture testimony uses the testimony family, is labelled unverified, and never alters
  candidate state.
- Certified disclosure art appears only around the existing warrant flow. Accepted fixture
  results remain clearly labelled simulations.
- Player hypotheses use their own family and remain non-canonical.
- Character emotion is a visual presentation adapter derived from interview openness, pending
  state, and transcript length. It is labelled “not evidence” and never feeds a game API.
- Verdict screens render only the existing terminal binary result. A NO screen never reveals the
  hidden solution.
- Technical UI shows real sanitized public metadata only and never fabricates live identifiers.

## Responsive and accessibility behavior

Desktop preserves the HUD, rail, scene, and notebook. Tablet removes the persistent notebook and
keeps it as a focus-trapped drawer. Mobile stacks scene content, turns positioned observation
hotspots into readable touch targets, and keeps room/warrant navigation plus the terminal action
available. All primary interactions are keyboard reachable, have visible focus, and retain text
status in addition to icon/color state.

Reduced-motion mode removes ambient loops and scene/character transitions while preserving state
changes. The introduction remains skippable. No approved audio assets exist, so settings report an
honest empty audio slot and no audio code is loaded.

## Integration seams

S1 must supply the existing public session fields with real Sui identifiers and proof states
without changing these presentation types. Until then, live session creation remains unavailable
and never falls back to fixtures.

G1 must supply verified testimony response state and real sanitized 0G response metadata through
the existing live adapter boundary. The UI must not animate or render testimony content before
verification succeeds. Fixture testimony remains explicitly scripted and unverified.

Final integration must demonstrate: live preparing/committing/confirmed/failed; testimony
pending/verified/failed; warrant safe/implied/unavailable/pending/confirmed/denied; accusation
pending; verdict access pending/failed; YES; NO without solution disclosure; and optional real
technical receipts where those integrations provide them.

## Local visual QA

Screenshots and browser caches are local QA artifacts only and must remain untracked. Validate the
opening, mode selection, case briefing, map, every room, interview, notebook, Warrant Desk,
accusation, both verdicts, technical details, failure states, long dialogue, empty evidence, and
reduced motion in the supported fixture runtime.
