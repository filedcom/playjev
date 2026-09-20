import { afterEach, describe, expect, it, vi } from "vitest";
import { JevClient } from "../../src/jev/client.js";

const questions = {
  result: { type: "noul" as const, instructions: "Is this a test?" },
};

afterEach(() => vi.unstubAllGlobals());

describe("JevClient", () => {
  it("returns a validated Jev response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ model: "jev-latest", answers: {}, usage: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new JevClient({ apiKey: "test", maxRetries: 0 });
    await expect(client.evaluate("state", questions)).resolves.toMatchObject({
      model: "jev-latest",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries transient responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ model: "jev-latest", answers: {}, usage: {} }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new JevClient({ apiKey: "test", maxRetries: 1 });
    await expect(client.evaluate("state", questions)).resolves.toMatchObject({
      model: "jev-latest",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent API errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new JevClient({ apiKey: "test", maxRetries: 2 });
    await expect(client.evaluate("state", questions)).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
