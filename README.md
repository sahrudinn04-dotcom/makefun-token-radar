# Token Radar — Pre-Token Protocol Board

![token-radar-01](https://make.fun/badge/token-radar-01.svg)
![rank](https://make.fun/badge/token-radar-01/sahrudinn04-dotcom/makefun-token-radar/rank.svg)
![reward](https://make.fun/badge/token-radar-01/sahrudinn04-dotcom/makefun-token-radar/reward.svg)

An entry for the make.fun bounty [Build the best token launch radar](https://make.fun/bounty/token-radar-01).

Sign up for make.fun through my referral link: https://make.fun/r/2c51b8pr

## What it is

Token Radar reads a sealed snapshot of the protocol universe (758 DefiLlama
protocols as of 2026-11-14) and ranks the protocols that record no token by
what a token launch would be worth if their record stayed as it is. Each row
carries a concrete farm plan: what to do, what it costs, and how long it takes.

- **260 rows**: all 40 watchlist protocols (TVL ≥ $50M, no token on record)
  plus 220 pre-token protocols below the floor, found early by the same rule.
- **Live-token view**: the 20 largest protocols whose token already trades,
  shown with their market caps and set aside from the ranking.
- **Dashboard**: a static page with no network — sortable board, filters by
  chain, category and search text, and a detail view for every protocol
  (`#/protocol/<slug>`).

## The value model (radar-2)

Every row is scored by one function of the snapshot's own figures. No
protocol name is special-cased.

```
implied = round( tvl_usd × 0.20
  × (1 + clamp(change_7d, -75, 150) / 100 × 0.6)
  × (0.65 + 0.35 × min(age_days, 1460) / 1460)
  × (1 + 0.05 × min(chains, 6)) )
```

- **Base**: a launch is priced off locked value, 20% of TVL.
- **Growth**: a protocol growing over seven days is worth more; a shrinking
  one less. Clamped to −75%…+150%.
- **Maturity**: the longer a protocol has run with no token, the more pent-up
  value its launch carries, up to four years.
- **Breadth**: a protocol live on more chains has more users to reward.

Age is the time since DefiLlama first listed the protocol; an unlisted age
uses 365 days. "No token" means the snapshot records no token — that is
DefiLlama's record, not proof a token does not exist.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22 or later, standard library only. The program writes `board.json`,
`data.js`, `dashboard/`, `screenshots/` and `dossier.json` to the output
directory, and runs twice to the same bytes.

## Layout

- `main.ts` — the entry program: reads the snapshot, writes the board and the dossier.
- `lib/model.ts` — the value model, the farm plans, and the board validation.
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte the kit's copy.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`.
- `screenshots/` — the board, a protocol detail view, and a filtered view.
