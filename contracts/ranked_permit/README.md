# Ranked Permit

This Move 2024 package is the isolated Sui boundary for World AgentKit Ranked
authorization. An `IssuerCap` gates mutations to the issuer-owned
`RankedPermitRegistry`; the capability must be bound to that exact registry.
Issuance records an opaque, level-scoped entitlement commitment in a dynamic
field and transfers a short-lived `RankedPermit` to its Sui recipient.

`consume_ranked_permit` verifies the recipient, canonical Alibi `LevelConfig`,
level identifier, and expiry before deleting the permit. The module contains no
proof, accusation, verdict, or terminal-finalization logic.
