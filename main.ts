// Sokoban solver for make.fun's sokoban-solver-01 bounty.
//
// How it works: the generator builds every level from independent rooms
// hanging off one hallway, so the level is split into rooms and each room is
// solved on its own with a breadth-first search over pushes (fewest pushes
// wins). A box pushed out of its room can never come back, so the rooms'
// optima add up to the level's optimum. Two prunings keep the search small:
// a square a box can never be pushed to a goal from (dead square), and a
// frozen 2x2 block of walls and boxes. The search is capped by states, never
// by the clock, so two runs of the program write the same bytes.
//
// Usage: node main.ts, reading /input/<id>/level.txt and writing
// /output/<id>/solution.txt (MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR stand in
// for the mounts when run locally).

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// One search is capped by states, never by the clock.
const MAX_STATES = 250_000;

type Dir = { dx: number; dy: number; walk: string; push: string };
const DIRS: Dir[] = [
  { dx: 0, dy: -1, walk: 'u', push: 'U' },
  { dx: 0, dy: 1, walk: 'd', push: 'D' },
  { dx: -1, dy: 0, walk: 'l', push: 'L' },
  { dx: 1, dy: 0, walk: 'r', push: 'R' },
];

type Board = {
  w: number;
  h: number;
  wall: Uint8Array; // 1 = wall
  goals: number[]; // sorted goal squares
  boxes: number[]; // sorted box squares
  player: number;
};

type Solution = { pushes: number; moves: string };

/** Parse an XSB level: # wall, space floor, . goal, $ box, * box on a goal, @ player, + player on a goal. */
function parse(text: string): Board {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals: number[] = [];
  const boxes: number[] = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  // The outer frame is wall whatever it shows, so a neighbour never leaves the board.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
    }
  }
  boxes.sort((a, b) => a - b);
  goals.sort((a, b) => a - b);
  return { w, h, wall, goals, boxes, player };
}

/**
 * The squares a box can be pushed onto some goal from, found by pulling
 * backwards from the goals: a box on square y can be pulled to x (a live
 * square) when the player could have stood behind it, on y - d, to push it.
 */
function liveSquares(b: Board): Uint8Array {
  const live = new Uint8Array(b.w * b.h);
  const queue: number[] = [];
  for (const g of b.goals) {
    live[g] = 1;
    queue.push(g);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const x = queue[qi];
    for (const d of DIRS) {
      const step = d.dy * b.w + d.dx;
      const from = x - step;
      const behind = from - step;
      if (!b.wall[from] && !b.wall[behind] && !live[from]) {
        live[from] = 1;
        queue.push(from);
      }
    }
  }
  return live;
}

/**
 * Flood the player's reachable region from `from` (walls and `occupied`
 * boxes block it), stamping it with `stamp` in `seen`, and return its lowest
 * square. The region is what a push state is keyed on, not the player's
 * exact square: anywhere inside the region pushes the same boxes.
 */
function reachLow(
  b: Board,
  occupied: Uint8Array,
  from: number,
  seen: Int32Array,
  stamp: number,
  stack: Int32Array,
): number {
  let low = from;
  let n = 0;
  stack[n++] = from;
  seen[from] = stamp;
  while (n > 0) {
    const p = stack[--n];
    if (p < low) low = p;
    for (const d of DIRS) {
      const q = p + d.dy * b.w + d.dx;
      if (b.wall[q] === 0 && occupied[q] === 0 && seen[q] !== stamp) {
        seen[q] = stamp;
        stack[n++] = q;
      }
    }
  }
  return low;
}

/**
 * Whether the box just pushed to `t` sits in a frozen 2x2 block: four
 * squares of walls and boxes, one of the boxes off its goal. Such a box can
 * never move again, so the state is dead.
 */
function frozenAt(b: Board, occupied: Uint8Array, goal: Uint8Array, t: number): boolean {
  const w = b.w;
  for (const a of [t, t - 1, t - w, t - w - 1]) {
    const c1 = a + 1;
    const c2 = a + w;
    const c3 = a + w + 1;
    if (!(b.wall[a] || occupied[a])) continue;
    if (!(b.wall[c1] || occupied[c1])) continue;
    if (!(b.wall[c2] || occupied[c2])) continue;
    if (!(b.wall[c3] || occupied[c3])) continue;
    if (
      (occupied[a] && !goal[a]) ||
      (occupied[c1] && !goal[c1]) ||
      (occupied[c2] && !goal[c2]) ||
      (occupied[c3] && !goal[c3])
    ) {
      return true;
    }
  }
  return false;
}

/** The shortest walk from `from` to `to` around walls and boxes, in lower LURD letters. */
function walkTo(b: Board, occupied: Uint8Array, from: number, to: number): string {
  if (from === to) return '';
  const prev = new Int32Array(b.w * b.h).fill(-1);
  const how: string[] = new Array(b.w * b.h);
  const queue: number[] = [from];
  prev[from] = from;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    if (p === to) break;
    for (const d of DIRS) {
      const q = p + d.dy * b.w + d.dx;
      if (b.wall[q] || occupied[q] || prev[q] !== -1) continue;
      prev[q] = p;
      how[q] = d.walk;
      queue.push(q);
    }
  }
  if (prev[to] === -1) throw new Error('walkTo: the push square is out of reach');
  let s = '';
  for (let p = to; p !== from; p = prev[p]) s = how[p] + s;
  return s;
}

/** The square the player stands on after playing `moves` (case aside) from `from`. */
function endOf(w: number, from: number, moves: string): number {
  let p = from;
  for (const ch of moves) {
    const c = ch.toLowerCase();
    p += c === 'u' ? -w : c === 'd' ? w : c === 'l' ? -1 : 1;
  }
  return p;
}

/**
 * Push-optimal solution of one board: breadth-first search over pushes, so
 * the first solved state met is the fewest pushes. A state is the boxes plus
 * the player's reachable region; pushes that land a box on a dead square or
 * freeze a 2x2 block are pruned. Returns null when the search gives up
 * (state cap) or the board has no solution.
 */
function solvePushOptimal(b: Board, maxStates: number): Solution | null {
  const size = b.w * b.h;
  const goal = new Uint8Array(size);
  for (const g of b.goals) goal[g] = 1;
  const live = liveSquares(b);
  const occupied = new Uint8Array(size);
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;

  const solved = (boxes: number[]): boolean => boxes.every((x) => goal[x]);
  if (b.boxes.some((x) => !live[x])) return null;

  // A state's key: the region's lowest square and the boxes, as digits in
  // base `size` while that stays exact (a room holds at most a handful of
  // boxes); a longer key otherwise.
  const keyOf = (boxes: number[], low: number): number | string => {
    if (boxes.length <= 5) {
      let k = low;
      for (const x of boxes) k = k * size + x;
      return k;
    }
    return `${low}:${boxes.join(',')}`;
  };

  // The states in the order found: their boxes, the player's square after
  // the push that made them, and the push itself, for the way back.
  const stateBoxes: number[][] = [b.boxes.slice()];
  const statePlayer: number[] = [b.player];
  const parent: number[] = [-1];
  const pushFrom: number[] = [-1];
  const pushTo: number[] = [-1];
  const index = new Map<number | string, number>();

  for (const x of b.boxes) occupied[x] = 1;
  const startLow = reachLow(b, occupied, b.player, seen, ++stamp, stack);
  for (const x of b.boxes) occupied[x] = 0;
  index.set(keyOf(b.boxes, startLow), 0);

  let found = solved(b.boxes) ? 0 : -1;
  for (let head = 0; found < 0 && head < stateBoxes.length; head++) {
    const boxes = stateBoxes[head];
    for (const x of boxes) occupied[x] = 1;
    const here = ++stamp;
    reachLow(b, occupied, statePlayer[head], seen, here, stack);
    for (let bi = 0; bi < boxes.length && found < 0; bi++) {
      const from = boxes[bi];
      for (const d of DIRS) {
        const step = d.dy * b.w + d.dx;
        const to = from + step;
        const behind = from - step;
        if (seen[behind] !== here || b.wall[to] || occupied[to] || !live[to]) continue;
        occupied[from] = 0;
        occupied[to] = 1;
        const frozen = frozenAt(b, occupied, goal, to);
        let key: number | string = -1;
        let next: number[] | null = null;
        if (!frozen) {
          next = boxes.slice();
          next[bi] = to;
          next.sort((a, c) => a - c);
          key = keyOf(next, reachLow(b, occupied, from, mark, ++stamp, stack));
        }
        occupied[to] = 0;
        occupied[from] = 1;
        if (frozen || index.has(key)) continue;
        if (stateBoxes.length >= maxStates) {
          for (const x of boxes) occupied[x] = 0;
          return null;
        }
        index.set(key, stateBoxes.length);
        stateBoxes.push(next!);
        statePlayer.push(from);
        parent.push(head);
        pushFrom.push(from);
        pushTo.push(to);
        if (solved(next!)) {
          found = stateBoxes.length - 1;
          break;
        }
      }
    }
    for (const x of boxes) occupied[x] = 0;
  }
  if (found < 0) return null;

  // The push list, then the moves: walk to each push's square, then push.
  const pushes: { from: number; to: number }[] = [];
  for (let s = found; s > 0; s = parent[s]) pushes.push({ from: pushFrom[s], to: pushTo[s] });
  pushes.reverse();
  let moves = '';
  let player = b.player;
  let boxes = b.boxes.slice();
  for (const p of pushes) {
    const step = p.to - p.from;
    const dir = DIRS.find((d) => d.dy * b.w + d.dx === step)!;
    for (const x of boxes) occupied[x] = 1;
    moves += walkTo(b, occupied, player, p.from - step);
    for (const x of boxes) occupied[x] = 0;
    moves += dir.push;
    player = p.from;
    boxes = boxes.map((x) => (x === p.from ? p.to : x)).sort((a, c) => a - c);
  }
  return { pushes: pushes.length, moves };
}

type Room = { boxes: number[]; goals: number[]; done: boolean };

/**
 * The level's rooms: cut the dead squares of the player's row (the hallway:
 * a box there reaches no goal) out of the floor, and each part left that
 * holds boxes is a room. Null when the level is no set of rooms (a box in
 * the hallway, a goal in the cut, or a part with more or fewer boxes than
 * goals).
 */
function roomsOf(b: Board): Room[] | null {
  const live = liveSquares(b);
  const row = Math.floor(b.player / b.w);
  const cut = new Uint8Array(b.w * b.h);
  for (let i = row * b.w; i < (row + 1) * b.w; i++) {
    if (!b.wall[i] && !live[i]) cut[i] = 1;
  }
  if (b.boxes.some((x) => cut[x])) return null;
  const part = new Int32Array(b.w * b.h).fill(-1);
  const parts: { boxes: number[]; goals: number[] }[] = [];
  for (let s = 0; s < b.w * b.h; s++) {
    if (b.wall[s] || cut[s] || part[s] >= 0) continue;
    const squares: number[] = [s];
    part[s] = parts.length;
    for (let i = 0; i < squares.length; i++) {
      for (const d of DIRS) {
        const q = squares[i] + d.dy * b.w + d.dx;
        if (!b.wall[q] && !cut[q] && part[q] < 0) {
          part[q] = parts.length;
          squares.push(q);
        }
      }
    }
    parts.push({ boxes: [], goals: [] });
  }
  for (const x of b.boxes) parts[part[x]].boxes.push(x);
  for (const g of b.goals) {
    if (part[g] < 0) return null;
    parts[part[g]].goals.push(g);
  }
  if (parts.some((p) => p.boxes.length !== p.goals.length)) return null;
  return parts.filter((p) => p.boxes.length > 0).map((p) => ({ ...p, done: false }));
}

/**
 * The level solved room by room: each room's push-optimal solution in turn,
 * the other rooms' boxes standing as walls (on their goals once their room
 * is done), the player walking on from where the last room left it. A box
 * never leaves its room, so the rooms' optima add up to the level's.
 */
function solveByRooms(b: Board): Solution | null {
  const rooms = roomsOf(b);
  if (rooms === null) return solvePushOptimal(b, MAX_STATES);
  let player = b.player;
  let pushes = 0;
  let moves = '';
  for (const room of rooms) {
    const wall = b.wall.slice();
    for (const other of rooms) {
      if (other === room) continue;
      for (const x of other.done ? other.goals : other.boxes) wall[x] = 1;
    }
    const sub: Board = {
      w: b.w,
      h: b.h,
      wall,
      goals: room.goals.slice().sort((a, c) => a - c),
      boxes: room.boxes.slice().sort((a, c) => a - c),
      player,
    };
    const solved = solvePushOptimal(sub, MAX_STATES);
    if (solved === null) return null;
    pushes += solved.pushes;
    moves += solved.moves;
    player = endOf(b.w, player, solved.moves);
    room.done = true;
  }
  return { pushes, moves };
}

/** Solve one level's text into its move string; an empty string when it gives up. */
function solveLevel(text: string): string {
  const result = solveByRooms(parse(text));
  return result === null ? '' : result.moves;
}

for (const id of readdirSync(IN_DIR).sort()) {
  const moves = solveLevel(readFileSync(join(IN_DIR, id, 'level.txt'), 'utf8'));
  mkdirSync(join(OUT_DIR, id), { recursive: true });
  writeFileSync(join(OUT_DIR, id, 'solution.txt'), `${moves}\n`);
}
