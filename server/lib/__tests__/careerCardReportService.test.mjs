import test from "node:test";
import assert from "node:assert/strict";
import { __testables } from "../careerCardReportService.mjs";

const {
  stableStringify,
  hashCareerCardInputs,
  normalizeCategoryScores,
  toStringArray,
  normalizeCandidateIdentifier,
  extractTextFromPdfBuffer,
  extractStringsFromPdfBlock,
  decodePdfEscape,
} = __testables;

test("stableStringify yields consistent ordering", () => {
  const a = stableStringify({ b: 2, a: 1, nested: { z: 1, a: 2 } });
  const b = stableStringify({ nested: { a: 2, z: 1 }, a: 1, b: 2 });
  assert.equal(a, b);
});

test("hashCareerCardInputs reacts to changes", () => {
  const base = {
    careerCardData: { skills: ["js"] },
    companyDescription: "Acme",
    roleDescription: "Engineer",
  };
  const hash1 = hashCareerCardInputs(base);
  const hash2 = hashCareerCardInputs({ ...base, roleDescription: "Designer" });
  assert.notEqual(hash1, hash2);
});

test("normalizeCategoryScores fills defaults", () => {
  const normalized = normalizeCategoryScores({
    technicalSkills: { score: 88.898, feedback: "Strong" },
  });
  assert.equal(Object.keys(normalized).length, 4);
  assert.equal(normalized.technicalSkills.score, 88.9);
  assert.equal(normalized.technicalSkills.feedback, "Strong");
  assert.equal(normalized.experience.feedback, "");
});

test("toStringArray strips falsy values", () => {
  const arr = toStringArray([" One ", 123, "", null, "Two"]);
  assert.deepEqual(arr, ["One", "Two"]);
});

test("normalizeCandidateIdentifier handles numeric and uuid", () => {
  const numeric = normalizeCandidateIdentifier(42);
  assert.ok(numeric.supabaseId);
  assert.equal(numeric.applicationId, 42);

  const uuid = "5e0152a3-09a2-4ffe-9390-3a4d19d1ba4a";
  const asUuid = normalizeCandidateIdentifier(uuid);
  assert.equal(asUuid.supabaseId, uuid);
  assert.equal(asUuid.applicationId, null);

  assert.throws(() => normalizeCandidateIdentifier("not-valid"), /invalid_candidate_id/);
});

test("decodePdfEscape handles known escapes", () => {
  assert.equal(decodePdfEscape("n"), "\n");
  assert.equal(decodePdfEscape("("), "(");
  assert.equal(decodePdfEscape("x"), "x");
});

test("extractStringsFromPdfBlock handles nested text", () => {
  const block = "/F1 12 Tf (Hello) Tj (World \\(test\\)) Tj";
  const strings = extractStringsFromPdfBlock(block);
  assert.deepEqual(strings, ["Hello", "World (test)"]);
});

test("extractTextFromPdfBuffer pulls basic text", () => {
  const fake = Buffer.from("BT (Line One) Tj ET BT (Line Two) Tj ET", "latin1");
  const text = extractTextFromPdfBuffer(fake);
  assert.equal(text, "Line One\nLine Two");
});
