# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/trshofbart/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/trshofbart/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar over a sealed DefiLlama snapshot: every protocol that records no token yet, ranked by the value its launch would carry if its record stayed as it is. The value is built only from the snapshot's own figures — a category peer multiple (the median market cap per TVL dollar of the category's live protocols, shrunk toward the global median), moved by the protocol's seven-day TVL growth and by how long it has run with no token, with wrapped, staked, bridged and exchange products ranked at a stated structural discount. Every row carries its own arithmetic and a concrete farm plan with costs and time on it, and the dashboard is sortable, filterable, and opens a detail view per protocol.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=qg6fkct4&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
