# Day-trading design container

This is the **most demanding profile UX in the repo.** Bloomberg-class density, 144Hz target, hotkey-first, sub-3-second observe-orient-decide-act cycle. Every other profile (long-term, swing, options) gets to relax visually; this one cannot.

## Why a dedicated container

The shared [`design/EQUITIES-DASHBOARD.md`](../EQUITIES-DASHBOARD.md) covers ~70% of what an equities cockpit needs. The remaining 30% — the **discipline triad** (`TiltGuardPill` + `PDTCounter` + `EodFlattenVerifier`), the kill switch, the hotkey overlay — is intraday-specific and would clutter the cross-profile brief. So we extract.

The same logic that justifies extracting this profile into its own repo (see [`profiles/day-trading/EXTRACT.md`](../../profiles/day-trading/EXTRACT.md)) justifies giving it its own design container: this is the only profile where the dashboard, the MCP server, and the discipline gate are **all** running live during market hours. The product surface is real-time, deployable, and self-contained.

## File index

| File | Purpose |
|---|---|
| [`UI-SPEC.md`](./UI-SPEC.md) | The full UX spec — 22 sections covering layout, every component, type/color, motion, data, mobile (intentionally hostile), a11y (discipline-critical), performance budget. |
| [`code/`](./code/) | Component stubs as they move from spec → built. Currently empty (just a `.gitkeep`). New components written here ship to [`web/components/`](../../web/components/) once a real route consumes them. |

## What's in the spec

The spec is structured top-to-bottom in the order you encounter a feature on the dashboard:

- **§0–2** — premise (compress OODA loop to < 3s), target hardware (2560×1440 default), top-level layout (Tailwind grid)
- **§3** — status strip components (BrokerChip, DataFeedPill, **PDTCounter**, KillSwitchIndicator, **TiltGuardPill**)
- **§4** — KPI ribbon (5 tiles: Equity, Day P&L, BP, Open Risk, Win Rate)
- **§5** — HeroChart extensions to [`web/components/HeroChart.tsx`](../../web/components/HeroChart.tsx) (timeframe tabs, drawing tools, anchored VWAP, pre/post shading)
- **§6** — OrderTicketPanel (R-based sizing, pre-trade gate stack, 1.5s hold-to-confirm for live)
- **§7** — Watchlist extensions to [`web/components/Watchlist.tsx`](../../web/components/Watchlist.tsx) (vim `j/k`, price flash, quick-add)
- **§8** — OpenPositionsTable (sticky bottom, R-multiple column, `Days Held` red-on-nonzero)
- **§9** — HotkeyOverlay (the source of truth for every binding)
- **§10** — KillSwitchButton (2s hold, audits to `data/journal/kill-switch/`)
- **§11** — **EodFlattenVerifier** (15:55 amber → 16:00 red, forces `data/journal/.../overnight-<sym>.md` write)
- **§12–14** — type, color, interaction, motion budgets
- **§15** — data shape (everything live; `data/state.yaml` polled 5s)
- **§16** — mobile (blocking interstitial — this is the only profile that refuses to render on phones)
- **§17** — a11y (TiltGuardPill is the only `aria-live="assertive"` surface in the repo)
- **§18** — performance budget (INP < 100ms, stricter than the shared brief)
- **§19–22** — what's unique to this profile, skill chains the UI surfaces, anti-patterns, open questions

## Cross-references

- Persona: [`profiles/day-trading/CLAUDE.md`](../../profiles/day-trading/CLAUDE.md)
- Routine: [`profiles/day-trading/PLAYBOOK.md`](../../profiles/day-trading/PLAYBOOK.md)
- Profile overview: [`profiles/day-trading/README.md`](../../profiles/day-trading/README.md)
- Extraction recipe: [`profiles/day-trading/EXTRACT.md`](../../profiles/day-trading/EXTRACT.md)
- Shared equities brief: [`design/EQUITIES-DASHBOARD.md`](../EQUITIES-DASHBOARD.md)
- Shared dashboard brief: [`design/DASHBOARD-BRIEF.md`](../DASHBOARD-BRIEF.md)
- Tilt-guard skill (the hook): [`.claude/skills/tilt-guard/SKILL.md`](../../.claude/skills/tilt-guard/SKILL.md)
- Skill library index: [`.claude/skills/README.md`](../../.claude/skills/README.md)

## A note on framing

If you are reading this because you are about to build a feature here: read [`UI-SPEC.md` §19](./UI-SPEC.md#19-what-this-profile-has-that-no-other-does) and [§21](./UI-SPEC.md#21-anti-patterns--explicitly-avoided) first. The set of things this dashboard deliberately does not ship is as load-bearing as the set of things it does. The discipline triad is the product; the chart and order ticket are the chrome around it.
