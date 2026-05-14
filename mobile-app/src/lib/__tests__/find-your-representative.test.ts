import { findYourRep } from "../find-your-representative";
import { supabase } from "../supabase";

jest.mock("../supabase", () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

const invokeMock = supabase.functions.invoke as jest.Mock;
const unavailableMessage =
  "Representative lookup is temporarily unavailable. Please try again later.";

describe("findYourRep", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws a validation error for empty input", async () => {
    await expect(findYourRep("   ")).rejects.toThrow("Please enter a location.");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("returns an array response from the Edge Function", async () => {
    const results = [{ id: "person-1", name: "Representative One" }];
    invokeMock.mockResolvedValue({ data: results, error: null });

    await expect(findYourRep("123 Main St")).resolves.toBe(results);
    expect(invokeMock).toHaveBeenCalledWith("find-your-rep", {
      body: { query: "123 Main St" },
    });
  });

  it("returns results from an object response", async () => {
    const results = [{ id: "person-2", name: "Representative Two" }];
    invokeMock.mockResolvedValue({ data: { results }, error: null });

    await expect(findYourRep("  Oakland, CA  ")).resolves.toBe(results);
    expect(invokeMock).toHaveBeenCalledWith("find-your-rep", {
      body: { query: "Oakland, CA" },
    });
  });

  it("throws a user-safe error for Supabase invocation errors", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: "provider url and diagnostic details" },
    });

    await expect(findYourRep("94546")).rejects.toThrow(unavailableMessage);
  });

  it("throws a user-safe error for provider error responses", async () => {
    invokeMock.mockResolvedValue({
      data: { error: "upstream provider body" },
      error: null,
    });

    await expect(findYourRep("94546")).rejects.toThrow(unavailableMessage);
  });

  it("throws a user-safe error for unexpected response shapes", async () => {
    invokeMock.mockResolvedValue({
      data: { status: "ok" },
      error: null,
    });

    await expect(findYourRep("94546")).rejects.toThrow(unavailableMessage);
  });

  it("throws a user-safe error for unexpected invocation failures", async () => {
    invokeMock.mockRejectedValue(new Error("https://provider.example.invalid/raw"));

    await expect(findYourRep("94546")).rejects.toThrow(unavailableMessage);
  });

  it("does not call global fetch", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    invokeMock.mockResolvedValue({ data: [], error: null });

    await expect(findYourRep("94546")).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
