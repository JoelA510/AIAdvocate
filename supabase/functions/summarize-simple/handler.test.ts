import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test({
  name: "summarize-simple is retired: 410, and no outbound request",
  fn: async () => {
    const realFetch = globalThis.fetch;
    const outbound: string[] = [];
    globalThis.fetch = (input: Request | URL | string) => {
      outbound.push(input instanceof Request ? input.url : String(input));
      return Promise.resolve(
        new Response("{}", {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      );
    };
    try {
      const { handler } = await import("./handler.ts");
      const res = await handler(
        new Request("http://localhost/summarize-simple", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bill_id: 1 }),
        }),
      );
      assertEquals(res.status, 410);
      assertEquals(await res.json(), { error: "Retired." });
      // No credentials were sent, and none would have changed the answer.
      const authorised = await handler(
        new Request("http://localhost/summarize-simple", {
          method: "POST",
          headers: { Authorization: "Bearer anything" },
          body: JSON.stringify({ bill_id: 1 }),
        }),
      );
      assertEquals(authorised.status, 410);
      // No database read or write and no model call.
      assertEquals(outbound, []);
    } finally {
      globalThis.fetch = realFetch;
    }
  },
});
