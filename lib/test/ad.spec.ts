import { Ad } from "../ad";
import { ScraperType } from "../helpers";
import * as scraper from "../scraper";

describe("Kijiji Ad", () => {
    const scraperSpy = jest.spyOn(scraper, "scrape");

    const validateAdValues = (ad: Ad, expected: scraper.AdInfo) => {
        for (const [key, value] of Object.entries(expected)) {
            // Special checking for invalid dates since NaN != NaN
            if (value instanceof Date && Number.isNaN(value.getTime())) {
                expect(Number.isNaN((ad as any)[key].getTime())).toBe(true);
            } else {
                expect((ad as any)[key]).toEqual(value);
            }
        }
    };

    afterEach(() => {
        jest.resetAllMocks();
    });

    describe("initialization", () => {
        it("should use default values when none are provided", () => {
            const ad = new Ad("http://example.com");
            validateAdValues(ad, {
                ...new scraper.AdInfo(),
                url: "http://example.com"
            });
            expect(ad.isScraped()).toBe(false);
        });

        it.each`
            property          | value
            ${"title"}        | ${"a title"}
            ${"description"}  | ${"a description"}
            ${"date"}         | ${new Date()}
            ${"image"}        | ${"http://example.com/someimage"}
            ${"images"}       | ${["http://example.com/image1", "http://example.com/image2"]}
            ${"attributes"}   | ${{ key1: "val1", key2: 123 }}
            ${"id"}           | ${"456"}
        `("should accept user-provided ad properties ($property=$value)", ({ property, value }) => {
            const ad = new Ad("http://example.com", { [property]: value });
            validateAdValues(ad, {
                ...new scraper.AdInfo(),
                url: "http://example.com",
                [property]: value
            });
            expect(ad.isScraped()).toBe(false);
        });

        it("should ignore invalid user-provided ad property", () => {
            const ad = new Ad("http://example.com", { invalid: 123 } as any as scraper.AdInfo);
            validateAdValues(ad, {
                ...new scraper.AdInfo(),
                url: "http://example.com"
            });
            expect(ad.isScraped()).toBe(false);
        });

        it("should allow overriding the isScraped flag", () => {
            const ad = new Ad("http://example.com", {}, true);
            expect(ad.isScraped()).toBe(true);
        });

        it("should not allow overriding isScraped function", () => {
            const ad = new Ad("http://example.com", { isScraped: 123 } as any as scraper.AdInfo);
            expect(ad.isScraped).toBeInstanceOf(Function);
        });

        it("should not allow overriding scrape function", () => {
            const ad = new Ad("http://example.com", { scrape: 123 } as any as scraper.AdInfo);
            expect(ad.scrape).toBeInstanceOf(Function);
        });

        it("should not allow overriding URL", () => {
            const ad = new Ad("http://example.com", { url: "http://example.org" } as any as scraper.AdInfo);
            expect(ad.url).toBe("http://example.com");
        });
    });

    describe("string representation", () => {
        it("should display only URL if ad has no properties", () => {
            const ad = new Ad("http://example.com");
            expect(ad.toString()).toBe("http://example.com\r\n");
        });

        it("should include date if present", () => {
            // The date printing is locale-specific, so use the setX() functions
            const date = new Date();
            date.setMonth(8);
            date.setDate(5);
            date.setFullYear(2020);
            date.setHours(20);
            date.setMinutes(5);

            const ad = new Ad("http://example.com", { date });
            expect(ad.toString()).toBe("[09/05/2020 @ 20:05] http://example.com\r\n");
        });

        it("should include title if present", () => {
            const ad = new Ad("http://example.com", { title: "My ad" });
            expect(ad.toString()).toBe("My ad\r\nhttp://example.com\r\n");
        });

        it("should include attributes if present", () => {
            const ad = new Ad("http://example.com", {
                attributes: {
                    mileage: 125864,
                    bedrooms: 4
                }
            });
            expect(ad.toString()).toBe("http://example.com\r\n* mileage: 125864\r\n* bedrooms: 4\r\n");
        });

        it("should handle malformed location attribute", () => {
            const ad = new Ad("http://example.com", {
                attributes: {
                    location: 7
                }
            });
            expect(ad.toString()).toBe("http://example.com\r\n* location: 7\r\n");
        });

        it("should include correct location attribute if present", () => {
            const ad = new Ad("http://example.com", {
                attributes: {
                    location: { mapAddress: "123 Main Street" }
                }
            });
            expect(ad.toString()).toBe("http://example.com\r\n* location: 123 Main Street\r\n");
        });
    });

    describe.each`
        test                         | scraperOptions
        ${"without scraper options"} | ${undefined}
        ${"with scraper options"}    | ${{ scraperType: ScraperType.HTML }}
    `("scrape of existing ad object ($test)", ({ scraperOptions }) => {
        it.each`
            withCallback
            ${true}
            ${false}
        `("should return error on scrape failure and leave ad unmodified (withCallback=$withCallback)", async ({ withCallback }) => {
            const error = new Error("Bad response");
            scraperSpy.mockRejectedValue(error);

            const ad = new Ad("http://example.com");
            const callback = jest.fn();
            expect(ad.isScraped()).toBe(false);

            try {
                await ad.scrape(scraperOptions, withCallback ? callback : undefined);
                fail("Expected error on scrape");
            } catch (err) {
                expect(err).toBe(error);

                expect(scraperSpy).toBeCalledWith(ad.url, scraperOptions);
                expect(ad.isScraped()).toBe(false);

                if (withCallback) {
                    expect(callback).toBeCalledWith(error);
                }
            }
        });

        it.each`
            withCallback
            ${true}
            ${false}
        `("should update ad details on successful scrape (withCallback=$withCallback)", async ({ withCallback }) => {
            // Of course this could only ever exist as a fake ad :(
            const mockAdInfo: scraper.AdInfo = {
                title: "Unlimited network requests",
                description: "No IP bans at all!",
                date: new Date(),
                image: "main image",
                images: ["dark room", "stock photo"],
                attributes: {
                    type: "Offer",
                    price: "Free",
                    seller: "Kijiji"
                },
                url: "http://example.com",
                id: "123"
            };
            scraperSpy.mockResolvedValue(mockAdInfo as scraper.AdInfo);

            const ad = new Ad("http://example.com");
            const callback = jest.fn();
            expect(ad.isScraped()).toBe(false);

            await ad.scrape(scraperOptions, withCallback ? callback : undefined);
            expect(scraperSpy).toBeCalledWith(ad.url, scraperOptions);
            expect(ad.isScraped()).toBe(true);
            validateAdValues(ad, mockAdInfo);

            if (withCallback) {
                expect(callback).toBeCalledWith(null);
            }
        });
    });

    describe.each`
        test                         | scraperOptions
        ${"without scraper options"} | ${undefined}
        ${"with scraper options"}    | ${{ scraperType: ScraperType.HTML }}
    `("get new ad object ($test)", ({ scraperOptions }) => {
        it.each`
            withCallback
            ${true}
            ${false}
        `("should return error on scrape failure (withCallback=$withCallback)", async ({ withCallback }) => {
            const error = new Error("Bad response");
            const callback = jest.fn();
            scraperSpy.mockRejectedValue(error);

            try {
                await Ad.Get("http://example.com", scraperOptions, withCallback ? callback : undefined);
                fail("Expected error on scrape");
            } catch (err) {
                expect(err).toBe(error);
                expect(scraperSpy).toBeCalledWith("http://example.com", scraperOptions);

                if (withCallback) {
                    expect(callback).toBeCalledWith(error, expect.any(Ad));
                }
            }
        });

        it.each`
            withCallback
            ${true}
            ${false}
        `("should return ad on successful scrape (withCallback=$withCallback)", async ({ withCallback }) => {
            const mockAdInfo: scraper.AdInfo = {
                title: "Looking for free stuff",
                description: "You just need to bring it to me. I'm doing you a favor",
                date: new Date(),
                image: "an image",
                images: ["supplemental image"],
                attributes: { type: "Wanted" },
                url: "http://example.com",
                id: "123"
            };
            const callback = jest.fn();
            scraperSpy.mockResolvedValue(mockAdInfo);

            const ad = await Ad.Get("http://example.com", scraperOptions, withCallback ? callback : undefined);
            expect(scraperSpy).toBeCalledWith("http://example.com", scraperOptions);

            expect(ad).toBeInstanceOf(Ad);
            expect(ad.url).toBe("http://example.com");
            expect(ad.isScraped()).toBe(true);
            validateAdValues(ad, mockAdInfo);

            if (withCallback) {
                expect(callback).toBeCalledWith(null, ad);
            }
        });
    });
});