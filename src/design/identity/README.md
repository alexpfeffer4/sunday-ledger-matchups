# Sunday Ledger identity implementation

This directory is the non-governing technical source of truth for the approved
Phase 11 B+A identity rollout. The SVGs are byte-for-byte copies of the verified
`phase-11-hybrid-ba-review.zip` package whose SHA-256 is
`6d04141da539c034bfd229cbafc22b6a8b2420fe4dcc4a1cad971a4a5b358208`.

The package was prepared before owner approval, so its immutable SVG metadata
retains the historical proposal notice. The owner explicitly approved this B+A
family for this implementation. Qualified trademark/legal review remains
deferred, and this record makes no legal-clearance claim.

`identity-manifest.json` maps each canonical source to its framework or public
export. `npm run identity:generate` produces the checked-in, metadata-free SVG
geometry strings used by React. `npm run identity:verify` checks that generation
is current; source and export hashes match the approved package; SVGs are
self-contained and effect-free; optical-master mapping, icon frames, dimensions,
maskable safety, monochrome color, and metadata declarations remain intact.

Optical use is explicit:

- micro Register: 16–20px;
- compact Register: 24–32px;
- standard/display Register: 48px and above;
- horizontal lockup: at least 132px wide;
- compact lockup: at least 96px wide.

Maintain at least 1X clear space around mark-only and compact lockups and 1.25X
around the horizontal lockup, where X is the micro master’s 10.5-unit stem.
Do not interpolate between masters or edit generated vectors directly.
