import { hashIp } from "./ip.ts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("hashIp is deterministic", async () => {
  const first = await hashIp("203.0.113.7", "pepper");
  const second = await hashIp("203.0.113.7", "pepper");
  assert(first === second, "same input should hash the same");
  assert(first.length === 64, "sha-256 hex should be 64 chars");
});

Deno.test("hashIp depends on the pepper", async () => {
  const first = await hashIp("203.0.113.7", "pepper-a");
  const second = await hashIp("203.0.113.7", "pepper-b");
  assert(first !== second, "different peppers should hash differently");
});
