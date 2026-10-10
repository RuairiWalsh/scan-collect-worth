import { describe, expect, it } from "vitest";
import { gateShot, gateTick, initGate } from "./capture-gate";

describe("capture gate", () => {
  it("allows only one capture while hovering over the same card, even as the view shifts", () => {
    let s = gateShot(initGate(), 0);
    let shots = 0;
    // 30 ticks (~5s) of hovering: the crop wobbles a lot (diff up to 25) and detection flickers briefly.
    for (let i = 1; i <= 30; i++) {
      const card = i % 7 !== 0;
      const r = gateTick(s, card, 10 + (i % 4) * 5, i * 180);
      s = r.state;
      if (r.canShoot) shots++;
    }
    expect(shots).toBe(0);
  });

  it("re-arms once the card has left view", () => {
    let s = gateShot(initGate(), 0);
    for (let i = 1; i <= 5; i++) s = gateTick(s, false, null, i * 180).state;
    expect(gateTick(s, true, 40, 1200).canShoot).toBe(true);
  });

  it("re-arms when a clearly different card is held in view for a moment", () => {
    let s = gateShot(initGate(), 0);
    let r = gateTick(s, true, 40, 1600);
    r = gateTick(r.state, true, 40, 1780);
    expect(r.canShoot).toBe(false);
    r = gateTick(r.state, true, 40, 1960);
    expect(r.canShoot).toBe(true);
  });

  it("does not recapture the same card when it comes back into view", () => {
    let s = gateShot(initGate(), 0);
    for (let i = 1; i <= 5; i++) s = gateTick(s, false, null, i * 180).state;
    expect(gateTick(s, true, 8, 1200).canShoot).toBe(false);
  });
});
