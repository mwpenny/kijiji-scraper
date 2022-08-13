import { isNumber, getLargeImageURL, cleanAdDescription, getScraperOptions, ScraperOptions, ScraperType, sleep } from "../helpers";

describe("Helpers", () => {
    beforeAll(() => {
        jest.useFakeTimers();
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    const flushFulfilledPromises = () => {
        return Promise.resolve();
    }

    it("sleep should wait the specified time", async () => {
        const callback = jest.fn();

        // Not resolved immediately
        const sleepPromise = sleep(10000).then(callback);
        await flushFulfilledPromises();
        expect(callback).not.toBeCalled();

        // Still not resolved after some time
        jest.advanceTimersByTime(9000);
        await flushFulfilledPromises();
        expect(callback).not.toBeCalled();

        // Finally resolved after full time has elapsed
        jest.advanceTimersByTime(1000);
        await sleepPromise;
        expect(callback).toBeCalled();
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
                    expect(err).toBeInstanceOf(Error);
                    expect((err as Error).message).toBe(
                        "Invalid value for scraper option 'scraperType'. Valid values are: api, html"
                    );
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