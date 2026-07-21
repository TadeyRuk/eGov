# Hackathon Mechanics

## Purpose

Ground truth for the eGovPH hackathon this repo is being built for. Captured from on-site event slides so the Orchestrator and agents stop guessing at scoring weights or event context. Supersedes any assumption elsewhere in this repo about what "done" or "good" means for the hackathon submission.

- Captured on: 2026-07-21
- Source: event stage slides ("Hackathon Guidelines & Mechanics" and the AI/Digital Transformation panel "Recommendations" slide)

## Judging criteria (100% total)

| Criterion | Weight |
|---|---|
| Integration to eGovPH Project | 30% |
| Impact to Society | 35% |
| UI/UX | 10% |
| Reels | 10% |
| Presentation | 15% |

**Reading the weights:** Integration + Impact to Society = 65% of the score. UI/UX, Reels, and Presentation together are only 35%. Polish is a minority of the grade — a submission that nails platform integration and shows real citizen/societal impact beats one that is merely pretty or well-rehearsed. Do not let build effort skew toward UI/UX at the expense of wiring real `platforms.e.gov.ph` services (`docs/platform-apis.md`) or articulating who in society benefits and how.

Two deliverables have no code footprint and are easy to forget until it's late:
- **Reels** (10%) — a short video/social-cut of the submission.
- **Presentation** (15%) — the pitch/demo itself.

## Panel context: "Building a Smarter, Stronger, and Future-Ready Philippines Through AI and Digital Transformation"

Grounding context from the co-located panel discussion. Useful for framing "Impact to Society" and "Integration to eGovPH Project" answers.

**Challenges** (what makes gov digital transformation hard):
- Resistance to change
- Legacy systems
- Workforce capability gaps
- Retention of highly skilled technical personnel
- Vendor dependency
- Organizational disruption during transition
- Connectivity disparities

**Lessons learned:**
- Digital identity is foundational.
- Interoperability must come before AI scaling.
- Trust and cybersecurity are prerequisites.
- Strong legislation accelerates adoption.
- Human-centered design improves uptake.
- AI should augment civil servants, not replace them.

**Recommendations:**
- Start with high-impact citizen services.
- Build national digital identity infrastructure.
- Invest in cloud, cybersecurity, and interoperability.
- Ensure sustainability through institutionalized funding and governance mechanisms.

## Implications for this repo

- `Integration to eGovPH Project` (30%) maps directly to `docs/platform-apis.md` and the `platform` agent — real adapter calls against the official 9 services, not mocked/invented endpoints.
- `Impact to Society` (35%) means the product pitch needs a named citizen problem and a measurable outcome, in line with "start with high-impact citizen services" from the panel.
- Security/trust posture (the `security` agent's mandate) is not just a hardening-stage checkbox here — the panel calls trust and cybersecurity a prerequisite, so it can be argued as part of "Impact to Society" and "Integration" credibility, not just a Stage 4 gate.
- Reels and Presentation are deliverables the production line (`docs/criteria.md`) does not currently track. Ship-stage planning should account for them explicitly.
