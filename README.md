# Sokoban Solver

[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/h2967963512-afk/sokoban-solver-01/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/h2967963512-afk/sokoban-solver-01/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

An entry for make.fun's `sokoban-solver-01-run-20261121` bounty ("Build the best Sokoban solver, 21 November 2026").

## How it works

The generator builds every level from independent rooms hanging off one hallway, so the solver splits the level into rooms and solves each room on its own with a breadth-first search over pushes (fewest pushes wins). A box pushed out of its room can never come back, so the rooms' optima add up to the level's optimum. Two prunings keep the search small: dead squares a box can never be pushed to a goal from, and frozen 2x2 blocks of walls and boxes. The search is capped by states, never by the clock, so two runs write the same bytes.

## Practice score

1,000,000 / 1,000,000 — every practice instance solved in its push-optimal count (13, 16, 29, 47, 60 pushes). The house baseline (plain-astar) scores 200,000 on the same set.

## Run it

```sh
node main.ts  # reads /input/<id>/level.txt, writes /output/<id>/solution.txt
```

Locally: `MAKEFUN_INPUT_DIR=<kit>/practice/input MAKEFUN_OUTPUT_DIR=out node main.ts`
