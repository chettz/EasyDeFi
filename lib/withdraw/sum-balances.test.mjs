import assert from "node:assert/strict";
import test from "node:test";
import { sumKnownBalances } from "./sum-balances.ts";

test("known balances are summed and failed networks are counted", () => {
  assert.deepEqual(sumKnownBalances([1_000_000n, undefined, 2_500_000n]), {
    total: 3_500_000n,
    failed: 1,
  });
});
