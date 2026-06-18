const { test, expect } = require("bun:test");
const { base64Url } = require("../serve.js");

test("base64Url handles standard string", () => {
  expect(base64Url("hello world")).toBe("aGVsbG8gd29ybGQ");
});

test("base64Url handles empty string", () => {
  expect(base64Url("")).toBe("");
});

test("base64Url replaces + with -", () => {
  // String.fromCharCode(0, 190) creates a string whose standard base64 encoding contains '+'
  // The standard base64 is AMK+
  const input = String.fromCharCode(0, 190);
  expect(base64Url(input)).toBe("AMK-");
});

test("base64Url replaces / with _", () => {
  // String.fromCharCode(128, 63) creates a string whose standard base64 encoding contains '/'
  // The standard base64 is woA/
  const input = String.fromCharCode(128, 63);
  expect(base64Url(input)).toBe("woA_");
});

test("base64Url removes =", () => {
  // 'a' has standard base64 encoding 'YQ=='
  // The two '=' should be removed
  expect(base64Url("a")).toBe("YQ");
});
