import {
  findLines,
  isPlayable,
  randomColor,
  samePos,
  shuffleGrid,
  swapped,
  tileAt,
  type Grid,
  type Line,
  type Pos,
  type Tile,
  type TileKind,
} from './board';
import type { Rng } from './rng';
import { pointsFor } from './scoring';

export const MAX_ROUNDS = 100;

export interface RoundStep {
  round: number;
  removed: { id: number; pos: Pos }[];
  /** Special tiles whose effect fired this round (rainbow swap source included). */
  triggered: { id: number; kind: TileKind; pos: Pos }[];
  spawned: { tile: Tile; pos: Pos }[];
  falls: { id: number; from: Pos; to: Pos }[];
  /** dropFrom: how many cells above the board the tile starts (1 = just above). */
  refills: { tile: Tile; to: Pos; dropFrom: number }[];
  gained: number;
  grid: Grid;
}

export interface Resolution {
  steps: RoundStep[];
  shuffle: { grid: Grid; moves: { id: number; to: Pos }[] } | null;
  gained: number;
}

export interface ResolveContext {
  colors: number;
  rng: Rng;
  nextId: number;
}

const key = (p: Pos): string => `${p.row},${p.col}`;

/**
 * Resolves a valid swap of a and b round by round until the board settles
 * (TD-004), then shuffles if no valid swap remains (TD-008).
 */
export function resolveSwap(
  grid: Grid,
  a: Pos,
  b: Pos,
  ctx: ResolveContext,
): { resolution: Resolution; grid: Grid; nextId: number } {
  let nextId = ctx.nextId;
  let current = swapped(grid, a, b);
  const steps: RoundStep[] = [];
  let gained = 0;

  // After the swap, tile originally at a is at b and vice versa.
  const atA = tileAt(current, a)!;
  const atB = tileAt(current, b)!;
  let rainbowSeed: { rainbow: Pos; color: Tile['color'] } | null = null;
  if (atA.kind === 'rainbow' && atB.kind !== 'rainbow') rainbowSeed = { rainbow: a, color: atB.color };
  else if (atB.kind === 'rainbow' && atA.kind !== 'rainbow') rainbowSeed = { rainbow: b, color: atA.color };

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const seeds: Pos[] = [];
    const triggered: RoundStep['triggered'] = [];
    let spawns: { kind: TileKind; color: Tile['color']; pos: Pos }[] = [];
    if (round === 1 && rainbowSeed) {
      const { rainbow, color } = rainbowSeed;
      seeds.push(rainbow);
      triggered.push({ id: tileAt(current, rainbow)!.id, kind: 'rainbow', pos: rainbow });
      current.forEach((row, r) =>
        row.forEach((t, c) => {
          if (t.color === color) seeds.push({ row: r, col: c });
        }),
      );
    } else {
      const lines = findLines(current);
      if (lines.length === 0) break;
      for (const line of lines) seeds.push(...line.cells);
      spawns = planSpawns(lines, round === 1 ? [b, a] : []);
    }

    const removedKeys = new Set<string>();
    const removed: RoundStep['removed'] = [];
    const queue = [...seeds];
    while (queue.length > 0) {
      const p = queue.shift()!;
      if (removedKeys.has(key(p))) continue;
      removedKeys.add(key(p));
      const t = tileAt(current, p)!;
      removed.push({ id: t.id, pos: p });
      if (t.kind === 'row' || t.kind === 'col') {
        triggered.push({ id: t.id, kind: t.kind, pos: p });
        const n = t.kind === 'row' ? current[0]!.length : current.length;
        for (let i = 0; i < n; i++) queue.push(t.kind === 'row' ? { row: p.row, col: i } : { row: i, col: p.col });
      }
    }

    const holes: (Tile | null)[][] = current.map((row) => row.slice());
    for (const r of removed) holes[r.pos.row]![r.pos.col] = null;
    const spawned: RoundStep['spawned'] = [];
    for (const s of spawns) {
      const tile: Tile = { id: nextId++, kind: s.kind, color: s.color };
      holes[s.pos.row]![s.pos.col] = tile;
      spawned.push({ tile, pos: s.pos });
    }

    const { grid: settled, falls, refills, nextId: afterRefill } = collapse(holes, ctx, nextId);
    nextId = afterRefill;
    current = settled;
    const points = pointsFor(removed.length, round);
    gained += points;
    steps.push({ round, removed, triggered, spawned, falls, refills, gained: points, grid: current });
  }

  let shuffle: Resolution['shuffle'] = null;
  if (!isPlayable(current)) {
    current = shuffleGrid(current, ctx.colors, ctx.rng);
    const moves: { id: number; to: Pos }[] = [];
    current.forEach((row, r) => row.forEach((t, c) => moves.push({ id: t.id, to: { row: r, col: c } })));
    shuffle = { grid: current, moves };
  }
  return { resolution: { steps, shuffle, gained }, grid: current, nextId };
}

/**
 * Special tiles for this round's lines (TD-005): exactly 4 → row/col tile of
 * the line colour, ≥5 → rainbow. Placed on a moved cell in the line when there
 * is one (preferred order given), else at index ⌊(n−1)/2⌋, moving on cyclically
 * past cells already taken by another spawn.
 */
function planSpawns(lines: Line[], preferred: Pos[]): { kind: TileKind; color: Tile['color']; pos: Pos }[] {
  const taken = new Set<string>();
  const out: { kind: TileKind; color: Tile['color']; pos: Pos }[] = [];
  for (const line of lines) {
    const n = line.cells.length;
    if (n < 4) continue;
    const kind: TileKind = n >= 5 ? 'rainbow' : line.dir === 'h' ? 'row' : 'col';
    let pos: Pos | undefined = preferred.find((p) => line.cells.some((c) => samePos(c, p)) && !taken.has(key(p)));
    if (!pos) {
      const start = Math.floor((n - 1) / 2);
      for (let k = 0; k < n && !pos; k++) {
        const c = line.cells[(start + k) % n]!;
        if (!taken.has(key(c))) pos = c;
      }
    }
    if (!pos) continue;
    taken.add(key(pos));
    out.push({ kind, color: kind === 'rainbow' ? null : line.color, pos });
  }
  return out;
}

/** Gravity then refill from the top with random colours (TD-004). */
function collapse(
  holes: (Tile | null)[][],
  ctx: ResolveContext,
  firstId: number,
): { grid: Grid; falls: RoundStep['falls']; refills: RoundStep['refills']; nextId: number } {
  let nextId = firstId;
  const rows = holes.length;
  const cols = holes[0]?.length ?? 0;
  const grid: Grid = Array.from({ length: rows }, () => new Array<Tile>(cols));
  const falls: RoundStep['falls'] = [];
  const refills: RoundStep['refills'] = [];
  for (let c = 0; c < cols; c++) {
    let to = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      const t = holes[r]![c];
      if (!t) continue;
      grid[to]![c] = t;
      if (to !== r) falls.push({ id: t.id, from: { row: r, col: c }, to: { row: to, col: c } });
      to--;
    }
    const empty = to + 1;
    for (let r = to; r >= 0; r--) {
      const tile: Tile = { id: nextId++, kind: 'normal', color: randomColor(ctx.colors, ctx.rng) };
      grid[r]![c] = tile;
      refills.push({ tile, to: { row: r, col: c }, dropFrom: empty - r });
    }
  }
  return { grid, falls, refills, nextId };
}
