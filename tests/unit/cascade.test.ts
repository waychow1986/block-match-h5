import { describe, expect, it } from 'vitest';
import { findLines, gridText, parseGrid, tileAt, type Pos } from '../../src/game/board';
import { MAX_ROUNDS, resolveSwap } from '../../src/game/cascade';
import { pointsFor } from '../../src/game/scoring';
import type { Rng } from '../../src/game/rng';

const p = (row: number, col: number): Pos => ({ row, col });

/** Refill colours cycle through 0..colors-1 in order. */
function cycle(colors: number): Rng {
  let i = 0;
  return () => ((i++ % colors) + 0.5) / colors;
}

function transpose(rows: string[]): string[] {
  return [...rows[0]!].map((_, c) => rows.map((r) => r[c]).join(''));
}

const flip = (q: Pos): Pos => ({ row: q.col, col: q.row });

function run(rows: string[], a: Pos, b: Pos, colors = 6, rng: Rng = cycle(colors)) {
  const grid = parseGrid(rows);
  const { resolution } = resolveSwap(grid, a, b, { colors, rng, nextId: 1000 });
  return { grid, resolution };
}

describe('a plain match (AC-4)', () => {
  const rows = ['1231', '2312', '3123', '0010'];
  const { grid, resolution } = run(rows, p(3, 2), p(3, 3));
  const step = resolution.steps[0]!;

  it('removes the line and scores it in round 1', () => {
    expect(step.round).toBe(1);
    expect(step.removed.map((r) => r.pos)).toEqual([p(3, 0), p(3, 1), p(3, 2)]);
    expect(step.gained).toBe(pointsFor(3, 1));
  });

  it('drops the tiles above and refills from the top', () => {
    expect(step.falls).toContainEqual({ id: tileAt(grid, p(0, 0))!.id, from: p(0, 0), to: p(1, 0) });
    expect(step.falls).toHaveLength(9);
    expect(step.refills.map((r) => [r.to, r.dropFrom])).toEqual([
      [p(0, 0), 1],
      [p(0, 1), 1],
      [p(0, 2), 1],
    ]);
    expect(step.refills.map((r) => r.tile.id)).toEqual([1000, 1001, 1002]);
    expect(step.grid.flat().every((t) => t != null)).toBe(true);
  });
});

describe('cascades score more per tile (AC-7)', () => {
  const rows = ['3423', '4234', '2115', '0010'];
  const { resolution } = run(rows, p(3, 2), p(3, 3));

  it('a line formed by falling tiles is removed in round 2 at a higher rate', () => {
    const [first, second] = resolution.steps;
    expect(first!.gained).toBe(pointsFor(3, 1));
    expect(second!.round).toBe(2);
    expect(second!.removed.map((r) => r.pos)).toEqual([p(3, 1), p(3, 2), p(3, 3)]);
    expect(second!.gained).toBe(pointsFor(3, 2));
    expect(second!.gained).toBeGreaterThan(first!.gained);
    expect(resolution.gained).toBe(resolution.steps.reduce((s, x) => s + x.gained, 0));
  });

  it('the settled board has no line left', () => {
    const last = resolution.shuffle?.grid ?? resolution.steps.at(-1)!.grid;
    expect(findLines(last)).toHaveLength(0);
  });
});

describe('special tiles are created (AC-8, AC-9, TD-005)', () => {
  const four = ['12312', '23123', '31031', '00102'];

  it('a horizontal line of 4 leaves a row-clearing tile on the moved cell', () => {
    const { resolution } = run(four, p(2, 2), p(3, 2));
    const step = resolution.steps[0]!;
    expect(step.removed).toHaveLength(4);
    expect(step.spawned).toEqual([{ tile: { id: 1000, kind: 'row', color: 0 }, pos: p(3, 2) }]);
    expect(tileAt(step.grid, p(3, 2))).toEqual({ id: 1000, kind: 'row', color: 0 });
  });

  it('a vertical line of 4 leaves a column-clearing tile', () => {
    const { resolution } = run(transpose(four), flip(p(2, 2)), flip(p(3, 2)));
    expect(resolution.steps[0]!.spawned).toEqual([{ tile: { id: 1000, kind: 'col', color: 0 }, pos: p(2, 3) }]);
  });

  it('a line of 5 leaves a rainbow tile', () => {
    const { resolution } = run(['12312', '23123', '31031', '00100'], p(2, 2), p(3, 2));
    const step = resolution.steps[0]!;
    expect(step.removed).toHaveLength(5);
    expect(step.spawned).toEqual([{ tile: { id: 1000, kind: 'rainbow', color: null }, pos: p(3, 2) }]);
  });

  it('a line of 3 leaves no special tile', () => {
    const { resolution } = run(['1231', '2312', '3123', '0010'], p(3, 2), p(3, 3));
    expect(resolution.steps[0]!.spawned).toEqual([]);
  });
});

describe('special tiles fire (AC-8, AC-9, A-8, A-9)', () => {
  it('a row-clearing tile in a line clears its whole row', () => {
    const { grid, resolution } = run(['12312', '23123', '31031', '0A124'], p(2, 2), p(3, 2));
    const step = resolution.steps[0]!;
    expect(step.removed.map((r) => r.pos).sort((x, y) => x.col - y.col)).toEqual([0, 1, 2, 3, 4].map((c) => p(3, c)));
    expect(step.triggered).toEqual([{ id: tileAt(grid, p(3, 1))!.id, kind: 'row', pos: p(3, 1) }]);
    expect(step.gained).toBe(pointsFor(5, 1));
  });

  it('a column-clearing tile in a line clears its whole column', () => {
    const { resolution } = run(transpose(['12312', '23123', '31031', '0a124']), p(2, 2), p(2, 3));
    const cleared = resolution.steps[0]!.removed.map((r) => r.pos);
    expect(cleared).toHaveLength(5);
    expect(cleared.every((q) => q.col === 3)).toBe(true);
  });

  it('a rainbow swapped with a tile clears every tile of that colour plus itself', () => {
    const rows = ['1231', '2*12', '3123', '4521'];
    const { grid, resolution } = run(rows, p(1, 1), p(1, 2));
    const step = resolution.steps[0]!;
    const ones = grid.flat().filter((t) => t.color === 1).map((t) => t.id);
    const rainbow = tileAt(grid, p(1, 1))!.id;
    expect(step.removed.map((r) => r.id).sort((x, y) => x - y)).toEqual([...ones, rainbow].sort((x, y) => x - y));
    expect(step.triggered[0]).toMatchObject({ id: rainbow, kind: 'rainbow' });
    expect(step.gained).toBe(pointsFor(ones.length + 1, 1));
  });

  it('a rainbow swapped with a row tile clears that colour and the row tile fires (A-9)', () => {
    const rows = ['1231', '2*B2', '3423', '4521'];
    const { grid, resolution } = run(rows, p(1, 1), p(1, 2));
    const removed = new Set(resolution.steps[0]!.removed.map((r) => r.id));
    for (const t of grid.flat()) if (t.color === 1) expect(removed.has(t.id)).toBe(true);
    // The row tile now sits at (1,1) and clears row 1.
    for (const t of grid[1]!) expect(removed.has(t.id)).toBe(true);
    expect(resolution.steps[0]!.triggered.map((t) => t.kind)).toEqual(['rainbow', 'row']);
  });

  it('a rainbow caught by a row clear is just removed (A-8)', () => {
    const { grid, resolution } = run(['12312', '23123', '31031', '0A1*4'], p(2, 2), p(3, 2));
    const step = resolution.steps[0]!;
    expect(step.removed.map((r) => r.id)).toContain(tileAt(grid, p(3, 3))!.id);
    expect(step.removed).toHaveLength(5);
    expect(step.triggered.map((t) => t.kind)).toEqual(['row']);
  });

  it('special tiles created in a cascade round use the middle of the line (R2)', () => {
    // Round 2: row 3 becomes 2,1,1,1,1 after falling -> line of 4 at cols 1..4.
    const { resolution } = run(['34234', '42342', '21151', '00101'], p(3, 2), p(3, 3));
    const second = resolution.steps[1]!;
    expect(second.removed.length).toBeGreaterThanOrEqual(4);
    expect(second.spawned[0]).toMatchObject({ tile: { kind: 'row', color: 1 }, pos: p(3, 2) });
  });
});

describe('termination', () => {
  it('stops after at most MAX_ROUNDS rounds even if refills keep matching', () => {
    const rows = ['000', '120', '201'];
    const { resolution } = run(rows, p(1, 2), p(1, 1), 1, () => 0);
    expect(resolution.steps.length).toBeLessThanOrEqual(MAX_ROUNDS);
    expect(gridText(resolution.steps.at(-1)!.grid)).toHaveLength(3);
  });
});
