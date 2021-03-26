import { isNumber, getLargeImageURL, cleanAdDescription, getScraperOptions, ScraperOptions, ScraperType, sleep } from "../helpers";

describe("Helpers", () => {
    const setTimeoutSpy = jest.spyOn(global, "setTimeout");

    afterEach(() => {
        jest.resetAllMocks();
    });

    it("sleep should wait the specified time", async () => {
        let callback: Function | undefined = undefined;
        setTimeoutSpy.mockImplementationOnce(
            (handler: TimerHandler, _timeout?: number, ..._args: any[]) => {
                callback = handler as Function;
                return 0;
            }
        );

        const promise = sleep(1234).then(() => "done");
        expect(setTimeoutSpy).toBeCalledWith(expect.any(Function), 1234);
        expect(callback).toBeDefined();

        callback!();
        expect(await promise).toBe("done");
    });

    it.each`
        input         | expectedResult
        ${"123"}      | ${true}
        ${" 123 "}    | ${true}
        ${"1.23"}     | ${true}
        ${"-123"}     | ${true}
        ${"-1.23"}    | ${true}
        ${"-123"}     | ${true}
        ${""}         | ${false}
        ${" "}        | ${false}
        ${"abc123"}   | ${false}
        ${"1.2.3"}    | ${false}
        ${"4 1/2"}    | ${false}
        ${"Infinity"} | ${false}
        ${"abc"}      | ${false}
    `("isNumber should detect numbers (input='$input')", ({ input, expectedResult }) => {
        expect(isNumber(input)).toBe(expectedResult);
    });

    it.each`
        test             | url                                     | expectedURL
        ${"regular URL"} | ${"http://example.com"}                 | ${"http://example.com"}
        ${"upsize JPG"}  | ${"http://example.com/images/$_12.JPG"} | ${"http://example.com/images/$_57.JPG"}
        ${"upsize PNG"}  | ${"http://example.com/images/$_34.PNG"} | ${"http://example.com/images/$_57.JPG"}
    `("getLargeImageURL should upsize image URLs ($test)", ({ url, expectedURL }) => {
        expect(getLargeImageURL(url)).toBe(expectedURL);
    });

    it.each`
        test                | description
        ${"well formatted"} | ${"My ad description"}
        ${"with label"}     | ${"My ad <label>blah</label>description"}
        ${"untrimmed"}      | ${"  \n\n  My ad description      \r\n"}
    `("cleanAdDescription should clean ad descriptions ($test)", ({ description }) => {
        expect(cleanAdDescription(description)).toBe("My ad description");
    });

    describe("get scraper options", () => {
        describe("scraper type", () => {
            it("should throw error for invalid scraper type", () => {
                const scraperOptions = { scraperType: "invalid" } as any as ScraperOptions;

                try {
                    getScraperOptions(scraperOptions);
                    fail("Expected error for bad scraper options");
                } catch (err) {
                    expect(err.message).toBe("Invalid value for scraper option 'scraperType'. Valid values are: api, html");
                }
            });

            it.each`
                scraperType
                ${ScraperType.API}
                ${ScraperType.HTML}
            `("should allow valid scraper to be specified (scraperType=$scraperType)", async ({ scraperType }) => {
                const scraperOptions = { scraperType };
                expect(getScraperOptions(scraperOptions)).toEqual(scraperOptions);
            });

            it("should default to API scraper", () => {
                expect(getScraperOptions({})).toEqual({ scraperType: ScraperType.API });
            });
        });
    });
});