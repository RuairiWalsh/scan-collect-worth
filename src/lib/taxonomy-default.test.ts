import { expect, it } from "vitest";
import { defaultCondition } from "./taxonomy";
it("starts raw sports cards as Ungraded", () => expect(defaultCondition("cards", "sports")).toBe("raw_ungraded"));
it("keeps TCG cards at Near Mint", () => expect(defaultCondition("cards", "tcg")).toBe("raw_nm"));
