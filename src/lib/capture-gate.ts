// Decides when live scan may capture again, so hovering over one card yields one capture.
// After a capture the scanner is "disarmed" until the card leaves view, or a clearly
// different card has been in view for a moment.

export const GATE = {
  missesToRearm: 5, // ~0.9s with no card in view
  sameCardDiff: 16, // below this, the framed content is the card we just captured
  newCardDiff: 28, // above this, it's clearly a different card
  newCardTicks: 3,
  minGapMs: 1500,
};

export type GateState = { armed: boolean; misses: number; diffTicks: number; lastShotAt: number };

export const initGate = (): GateState => ({ armed: true, misses: 0, diffTicks: 0, lastShotAt: 0 });

/** One detection tick. `diff` = difference from the last captured card (null if none yet). */
export function gateTick(s: GateState, card: boolean, diff: number | null, now: number): { state: GateState; canShoot: boolean } {
  if (!card) {
    const misses = s.misses + 1;
    return { state: { ...s, misses, diffTicks: 0, armed: s.armed || misses >= GATE.missesToRearm }, canShoot: false };
  }
  let { armed, diffTicks } = s;
  if (!armed) {
    diffTicks = diff != null && diff > GATE.newCardDiff && now - s.lastShotAt > GATE.minGapMs ? diffTicks + 1 : 0;
    if (diffTicks >= GATE.newCardTicks) armed = true;
  }
  const sameCard = diff != null && diff < GATE.sameCardDiff;
  return { state: { ...s, misses: 0, diffTicks, armed }, canShoot: armed && !sameCard };
}

export const gateShot = (s: GateState, now: number): GateState => ({ ...s, armed: false, diffTicks: 0, lastShotAt: now });
