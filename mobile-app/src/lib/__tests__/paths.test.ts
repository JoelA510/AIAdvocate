import { PATHS } from "@/lib/paths";

describe("PATHS.repProfileIn", () => {
  it("builds the bills tab legislator route", () => {
    const href = PATHS.repProfileIn("bills", { id: "123" });

    expect(href).toEqual({
      pathname: "/legislator/[id]",
      params: { id: "123", originTab: "bills" },
    });
  });

  it("serializes payload objects and targets the advocacy tab", () => {
    const href = PATHS.repProfileIn("advocacy", {
      id: "lookup",
      payload: { foo: "bar" },
      billId: null,
    });

    expect(href).toEqual({
      pathname: "/(tabs)/advocacy/legislator/[id]",
      params: { id: "lookup", originTab: "advocacy", payload: '{"foo":"bar"}' },
    });
  });
});
