# CLAUDE

Project-specific guidance for AI coding agents.

## Display copy: the paraphrase test (MANDATORY before committing)

Run on EVERY changed headline, hero line, H2, card caption or CTA, on the rendered section, never on the one line in the diff. These are judgement checks, so they are yours, not a script's (`check:copy` covers phrase bans, intensifiers and ungrounded claim shapes only).

1. **Paraphrase it, literally.** Restate the claim in Simplified Technical English (ASD-STE100: active voice, one claim per sentence, common words, no metaphor). If you cannot say what it concretely promises, the line dies. Shipped and reverted: "Cut where the light can check it", "Every claim footnoted, set like a printed page", "One line worth holding while it runs", "Know what the fee buys".
2. **Read the slot as well as the line.** Check it against the neighbouring card, the section's job, the domain, and every other surface stating the same fact (grep before you commit).

## The label test: an eyebrow is EARNED, never inherited (MANDATORY)

Run on every eyebrow, section heading and intro line. **Name the fact the label adds that the section's own content does not already show. No fact, no label.** Write the section without it first and read the rendered page. The neighbouring sections are not evidence, and the jump nav is not a reason to print a heading. `check:structure` catches headings that restate what is under them and instruction lines over controls; the rest is yours.

## Word budgets and acceptance scenarios

Run `npm run check:words` against the build you are about to ship, before every prod deploy (budgets only go down; details in `scripts/word-budgets.json` and the script help). Before a deploy, gate change, copy change or client-platform edit, read `docs/SCENARIOS.md` (only checks a script cannot make).

## Service line: web design (WaaS retainer)

Sold at solaisoft.com/web-design; Station Street Fitness is the founding client. Use `/tam-builder` (who to approach) before `/prospect-to-pitch` (one named prospect to a live demo); `/cold-email-craft` consumes tam-builder's CSV and owns the AU Spam Act gate.

**Since 2026-09-18 (Macdara):** every new client site is a custom Astro or Next.js build. Solaisoft no longer advertises or offers in-place enhancement of a site-builder site on ANY platform (Squarespace, WordPress, Webflow, Wix, Shopify). The pitch to a builder-site owner is a move onto a site we build and host: a builder reading is a reason to pitch a rebuild, never a polish. The demo is the custom site we would deliver, and the walk-in script offers a new build. Naming three specific defects on their current site still opens the conversation (`docs/playbooks/squarespace-polish.md`). `/services/site-refresh` is deleted and 308s to `/websites`; Schedule A4 and `lib/agreement/terms.ts` are retired for new agreements but kept for signed clients; `scripts/mint-agreement-token.mjs` refuses to mint one, no override. Starter is the one-page look only; the /pricing "I already have a site" answer is Complete.

**Not retired:** existing Squarespace clients keep their work (Engine Room Fitness included). AI audits, AI visibility and AEO, SEO and Google-reviews management continue on clients' Squarespace sites and are still sold, and the Squarespace tooling stays in use. Frame it as capability, never as an offer.

## Editing a client's Squarespace site: read the reference FIRST

Before any browser-driven edit to a Squarespace site, **read `docs/portal/SQUARESPACE-REFERENCE.md`**. Several obvious approaches are destructive: new and duplicated pages are created ENABLED (disable as the very next action), rich-text blocks need `element.editor.commands.setContent(html, true)`, and enabled vs disabled can only be told apart by an unauthenticated `curl`. Design judgement: `docs/playbooks/squarespace-polish.md`.

## Middleware is proxy.ts (Next 16)

Route middleware lives in `proxy.ts` (`export function proxy`), Next 16's rename of `middleware.ts`. It holds all four auth gates: /nomadik, /handymanclonakilty, /client and the dormant pre-launch gate. A `middleware.ts` you add will be ignored and the gate silently won't run.

## Where to read first

Before client work, **Read `docs/clients/<slug>/CLAUDE.md`** if it exists (today: `engineroomfitness`, `handymanclonakilty`). Before searching or writing in `docs/`, **Read `docs/CLAUDE.md`**. Claude Code loads a nested CLAUDE.md only after a Read in that folder; Glob and Grep do not count.

## Work-surface data files - do not mix

- `lib/work.ts` = Solaisoft's OWN SaaS
- `lib/case-studies.ts` = paid CLIENT work
- `lib/showcases.ts` = Studio Showcase
