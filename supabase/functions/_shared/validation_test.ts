import { parseIssueInput } from "./validation.ts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("rejects an empty title", () => {
  const result = parseIssueInput({ type: "bug", title: "   " });
  assert(result.ok === false, "empty title should be rejected");
});

Deno.test("accepts a minimal bug", () => {
  const result = parseIssueInput({ type: "bug", title: "Chest bug" });
  assert(result.ok === true, "minimal bug should be accepted");
  if (result.ok) {
    assert(result.value.title === "Chest bug", "title should be preserved");
    assert(result.value.description === "", "description should default to empty");
    assert(result.value.attachment_paths.length === 0, "attachments should default to empty");
  }
});

Deno.test("rejects unknown types", () => {
  const result = parseIssueInput({ type: "question", title: "Hello" });
  assert(result.ok === false, "unknown type should be rejected");
});

Deno.test("caps attachments at five", () => {
  const result = parseIssueInput({ type: "idea", title: "Idea", attachment_paths: ["a", "b", "c", "d", "e", "f"] });
  assert(result.ok === false, "six attachments should be rejected");
});

Deno.test("rejects a malformed id", () => {
  const result = parseIssueInput({ type: "bug", title: "x", id: "not-a-uuid" });
  assert(result.ok === false, "malformed id should be rejected");
});

Deno.test("accepts a valid uuid id", () => {
  const result = parseIssueInput({ type: "bug", title: "x", id: "bbbbbbbb-0000-0000-0000-000000000001" });
  assert(result.ok === true, "valid uuid should be accepted");
});
