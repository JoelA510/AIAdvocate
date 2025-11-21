import { extractBillStatusDetails } from "../billStatus";

describe("billStatus", () => {
    describe("extractBillStatusDetails", () => {
        it("should extract status from status_text field", () => {
            const bill = {
                status: null,
                status_text: "Passed Assembly",
                status_date: "2024-01-15",
            };

            const result = extractBillStatusDetails(bill);

            expect(result.statusLabel).toBe("Passed Assembly");
            expect(result.statusDate).toBe("2024-01-15");
        });

        it("should fall back to status field if status_text is null", () => {
            const bill = {
                status: "1", // Maps to "Introduced" in STATUS_LABELS
                status_text: null,
                status_date: null,
            };

            const result = extractBillStatusDetails(bill);

            expect(result.statusLabel).toBe("Introduced");
        });

        it("should handle missing status fields gracefully", () => {
            const bill = {
                status: null,
                status_text: null,
                status_date: null,
            };

            const result = extractBillStatusDetails(bill);

            expect(result.statusLabel).toBeNull();
            expect(result.statusDate).toBeNull();
        });

        it("should extract date from status_date field", () => {
            const bill = {
                status: "4", // Maps to "Passed"
                status_text: "Passed",
                status_date: "2024-03-20",
            };

            const result = extractBillStatusDetails(bill);

            expect(result.statusDate).toBe("2024-03-20");
        });
    });
});
