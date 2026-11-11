import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { Provider as PaperProvider } from "react-native-paper";

import DataFreshnessNote from "../DataFreshnessNote";
import { QueryWrapper } from "../../test-utils/query";
import { supabase } from "../../lib/supabase";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options: any) => {
      if (typeof options === "string") return options;
      const text: string = options?.defaultValue ?? key;
      return options?.date ? text.replace("{{date}}", options.date) : text;
    },
  }),
}));

jest.mock("../../lib/supabase", () => ({
  supabase: { rpc: jest.fn() },
}));

const rpc = supabase.rpc as jest.Mock;

const renderNote = () =>
  render(
    <PaperProvider>
      <QueryWrapper>
        <DataFreshnessNote />
      </QueryWrapper>
    </PaperProvider>,
  );

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const HOUR = 60 * 60 * 1000;

describe("DataFreshnessNote", () => {
  beforeEach(() => rpc.mockReset());

  it("shows the checked date and, in a quiet period, the recess line", async () => {
    rpc.mockResolvedValue({
      data: { last_checked_at: iso(HOUR), latest_action_date: "2020-09-30" },
      error: null,
    });
    const { findByText, getByText } = await renderNote();
    expect(
      await findByText(/^Checked against Legislature records \d{2}\/\d{2}\/\d{4}$/),
    ).toBeTruthy();
    expect(
      getByText(
        "No tracked bill has had legislative action since 09/30/2020. The Legislature may be in recess.",
      ),
    ).toBeTruthy();
  });

  it("warns when the last check is older than the allowance", async () => {
    rpc.mockResolvedValue({
      data: { last_checked_at: iso(72 * HOUR), latest_action_date: "2020-09-30" },
      error: null,
    });
    const { findByText, queryByText } = await renderNote();
    expect(await findByText(/^Bill information may be out of date\. Last checked/)).toBeTruthy();
    // A stale check says nothing about whether the Legislature is quiet.
    expect(queryByText(/may be in recess/)).toBeNull();
  });

  it("warns without a date when no check is on record", async () => {
    rpc.mockResolvedValue({
      data: { last_checked_at: null, latest_action_date: null },
      error: null,
    });
    const { findByText } = await renderNote();
    expect(await findByText(/We could not confirm when it was last checked/)).toBeTruthy();
  });

  it("renders nothing when the lookup fails", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("network") });
    const { queryByTestId } = await renderNote();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(queryByTestId("data-freshness-note")).toBeNull();
  });
});
