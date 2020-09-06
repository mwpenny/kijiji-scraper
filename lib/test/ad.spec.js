jest.mock("../scraper");
const scraperSpy = require("../scraper");
const kijiji = jest.requireActual("../..");

describe("Kijiji Ad", () => {
    const validateAdValues = (ad, expected) => {
        for (const [key, value] of Object.entries(expected)) {
            // Special checking for invalid dates since NaN != NaN
            if (value instanceof Date && Number.isNaN(value.getTime())) {
                expect(Number.isNaN(ad[key].getTime())).toBe(true);
            } else {
                expect(ad[key]).toEqual(value);
            }
        }
    };

    describe("initialization", () => {
        const defaultValues = {
            title: "",
            description: "",
            date: new Date(NaN),
            image: "",
            images: [],
            attributes: {}
        };

        it("should use default values when none are provided", () => {
            const ad = new kijiji.Ad("http://example.com");
            validateAdValues(ad, defaultValues);
            expect(ad.url).toBe("http://example.com");
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
        `("should accept user-provided ad properties ($property=$value)", ({ property, value }) => {
            const ad = new kijiji.Ad("http://example.com", { [property]: value });
            validateAdValues(ad, {
                ...defaultValues,
                [property]: value
            });
            expect(ad.url).toBe("http://example.com");
            expect(ad.isScraped()).toBe(false);
        });

        it("should ignore invalid user-provided ad property", () => {
            const ad = new kijiji.Ad("http://example.com", { invalid: 123 });
            validateAdValues(ad, defaultValues);
            expect(ad.url).toBe("http://example.com");
            expect(ad.isScraped()).toBe(false);
        });

        it("should allow overriding the isScraped flag", () => {
            const ad = new kijiji.Ad("http://example.com", {}, true);
            expect(ad.isScraped()).toBe(true);
        });
    });

    describe("string representation", () => {
        it("should only display URL if ad has no properties", () => {
            const ad = new kijiji.Ad("http://example.com");
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

            const ad = new kijiji.Ad("http://example.com", { date });
            expect(ad.toString()).toBe("[09/05/2020 @ 20:05] http://example.com\r\n");
        });

        it("should include title if present", () => {
            const ad = new kijiji.Ad("http://example.com", { title: "My ad" });
            expect(ad.toString()).toBe("My ad\r\nhttp://example.com\r\n");
        });

        it("should include attributes if present", () => {
            const ad = new kijiji.Ad("http://example.com", {
                attributes: {
                    mileage: 125864,
                    bedrooms: 4
                }
            });
            expect(ad.toString()).toBe("http://example.com\r\n* mileage: 125864\r\n* bedrooms: 4\r\n");
        });

        it("should handle malformed location attribute", () => {
            const ad = new kijiji.Ad("http://example.com", {
                attributes: {
                    location: 7
                }
            });
            expect(ad.toString()).toBe("http://example.com\r\n* location: 7\r\n");
        });

        it("should include correct location attribute if present", () => {
            const ad = new kijiji.Ad("http://example.com", {
                attributes: {
                    location: { mapAddress: "123 Main Street" }
                }
            });
            expect(ad.toString()).toBe("http://example.com\r\n* location: 123 Main Street\r\n");
        });
    });

    describe("scrape of existing ad object", () => {
        afterEach(() => {
            scraperSpy.mockReset();
        });

        it.each`
            withCallback
            ${true}
            ${false}
        `("should return error on scrape failure and leave ad unmodified (withCallback=$withCallback)", async ({ withCallback }) => {
            const error = new Error("Bad response");
            scraperSpy.mockRejectedValue(error);

            const ad = new kijiji.Ad("http://example.com");
            const callback = jest.fn();
            expect(ad.isScraped()).toBe(false);

            try {
                await ad.scrape(withCallback ? callback : undefined);
                fail("Expected error on scrape");
            } catch (err) {
                expect(err).toBe(error);

                expect(scraperSpy).toBeCalledWith(ad.url);
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
            const mockAdInfo = {
                title: "Unlimited network requests",
                description: "No IP bans at all!",
                date: new Date(),
                attributes: {
                    type: "Offer",
                    price: "Free",
                    seller: "Kijiji"
                }
            };
            scraperSpy.mockResolvedValue(mockAdInfo);

            const ad = new kijiji.Ad("http://example.com");
            const callback = jest.fn();
            expect(ad.isScraped()).toBe(false);

            await ad.scrape(withCallback ? callback : undefined);
            expect(scraperSpy).toBeCalledWith(ad.url);
            expect(ad.isScraped()).toBe(true);
            validateAdValues(ad, mockAdInfo);

            if (withCallback) {
                expect(callback).toBeCalledWith(null);
            }
        });
    });

    describe("get new ad object", () => {
        it.each`
            withCallback
            ${true}
            ${false}
        `("should return error on scrape failure (withCallback=$withCallback)", async ({ withCallback }) => {
            const error = new Error("Bad response");
            const callback = jest.fn();
            scraperSpy.mockRejectedValue(error);

            try {
                await kijiji.Ad.Get("http://example.com", withCallback ? callback : undefined);
                fail("Expected error on scrape");
            } catch (err) {
                expect(err).toBe(error);
                expect(scraperSpy).toBeCalledWith("http://example.com");

                if (withCallback) {
                    expect(callback).toBeCalledWith(error);
                }
            }
        });

        it.each`
            withCallback
            ${true}
            ${false}
        `("should return ad on successful scrape (withCallback=$withCallback)", async ({ withCallback }) => {
            const mockAdInfo = {
                title: "Looking for free stuff",
                description: "You just need to bring it to me. I'm doing you a favor",
                date: new Date(),
                attributes: { type: "Wanted" }
            };
            const callback = jest.fn();
            scraperSpy.mockResolvedValue(mockAdInfo);

            const ad = await kijiji.Ad.Get("http://example.com", withCallback ? callback : undefined);
            expect(scraperSpy).toBeCalledWith("http://example.com");

            expect(ad).toBeInstanceOf(kijiji.Ad);
            expect(ad.url).toBe("http://example.com");
            expect(ad.isScraped()).toBe(true);
            validateAdValues(ad, mockAdInfo);

            if (withCallback) {
                expect(callback).toBeCalledWith(null, ad);
            }
        });
    });
});