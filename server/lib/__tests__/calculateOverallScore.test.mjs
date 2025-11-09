import test from "node:test";
import assert from "node:assert/strict";
import { calculateOverallScore } from "../careerCardReportService.mjs";

test("returns null when both scores missing", () => {
  const result = calculateOverallScore(null, null);
  assert.deepEqual(result, { score: null, confidence: 0 });
});

const approx = (value, expected, delta = 0.25) => {
  assert.ok(Math.abs(value - expected) <= delta, `Expected ${value} ≈ ${expected}`);
};

test("handles simulation only", () => {
  const result = calculateOverallScore(90, null);
  approx(result.score, 89.06, 0.25);
  assert.equal(result.confidence, 0.7);
});

test("handles career card only", () => {
  const result = calculateOverallScore(null, 80);
  assert.equal(result.score, 80);
  assert.equal(result.confidence, 0.3);
});

test("matches mixed example", () => {
  const { score, confidence } = calculateOverallScore(90, 80);
  approx(score, 86.34, 0.3);
  assert.equal(confidence, 1);
});
