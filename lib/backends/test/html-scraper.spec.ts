jest.mock("node-fetch");

import fetch from "node-fetch";
import * as helpers from "../../helpers";
import { scrapeHTML as scraper } from "../html-scraper";

describe("Ad HTML scraper", () => {
    const fetchSpy = fetch as any as jest.Mock;

    afterEach(() => {
        jest.resetAllMocks();
    });

    const mockResponse = (body: string) => {
        fetchSpy.mockResolvedValue({
            text: () => body
        });
    };

    const validateRequest = () => {
        expect(fetchSpy).toBeCalledWith(
            "http://example.com",
            {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:79.0) Gecko/20100101 Firefox/79.0"
                }
            }
        );
    };

    const createAdHTML = (info: any) => {
        return `
            <html>
                <body>
                    <div id="FesLoader">
                        <script type="text/javascript">window.__data=${JSON.stringify(info)};</script>
                    </div>
                </body>
            </html>
        `;
    };

    it.each`
        test                         | html
        ${"Bad markup"}              | ${"Bad markup"}
        ${"Missing FesLoader"}       | ${"<html></html>"}
        ${"Empty FesLoader"}         | ${createAdHTML({})}
        ${"Missing config property"} | ${createAdHTML({ abc: 123 })}
        ${"Missing adInfo property"} | ${createAdHTML({ config: {} })}
        ${"Missing VIP property"}    | ${createAdHTML({ config: { adInfo: {} } })}
    `("should fail to scrape invalid HTML ($test)", async ({ html }) => {
        mockResponse(html);

        const adInfo = await scraper("http://example.com");
        validateRequest();
        expect(adInfo).toBeNull();
    });

    describe("valid markup", () => {
        it("should scrape title", async () => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: {
                        title: "My ad title"
                    },
                    VIP: {}
                }
            }));

            const adInfo = await scraper("http://example.com");
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.title).toBe("My ad title");;
        });

        it.each`
            test         | description            | expected
            ${"missing"} | ${undefined}           | ${""}
            ${"present"} | ${"My ad description"} | ${"My ad description"}
        `("should scrape description ($test)", async ({ description, expected }) => {
            const cleanAdDescriptionSpy = jest.spyOn(helpers, "cleanAdDescription");
            cleanAdDescriptionSpy.mockReturnValueOnce("Clean description");

            mockResponse(createAdHTML({
                config: {
                    adInfo: {},
                    VIP: {
                        description
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            validateRequest();
            expect(cleanAdDescriptionSpy).toBeCalledWith(expected);
            expect(adInfo).not.toBeNull();
            expect(adInfo!.description).toBe("Clean description");

            cleanAdDescriptionSpy.mockRestore();
        });

        it("should scrape date", async () => {
            const date = new Date();
            mockResponse(createAdHTML({
                config: {
                    adInfo: {},
                    VIP: {
                        sortingDate: date
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.date).toEqual(date);
        });

        it("should scrape image", async () => {
            const getLargeImageURLSpy = jest.spyOn(helpers, "getLargeImageURL");
            getLargeImageURLSpy.mockReturnValueOnce("large image URL");

            mockResponse(createAdHTML({
                config: {
                    adInfo: {
                        sharingImageUrl: "some image URL"
                    },
                    VIP: {}
                }
            }));

            const adInfo = await scraper("http://example.com");
            validateRequest();
            expect(getLargeImageURLSpy).toBeCalledWith("some image URL");
            expect(adInfo).not.toBeNull();
            expect(adInfo!.image).toBe("large image URL");

            getLargeImageURLSpy.mockRestore();
        });

        it("should scrape images", async () => {
            const getLargeImageURLSpy = jest.spyOn(helpers, "getLargeImageURL");
            getLargeImageURLSpy.mockImplementation(url => url + "_large");

            mockResponse(createAdHTML({
                config: {
                    adInfo: {},
                    VIP: {
                        media: [
                            // Invalid
                            { type: "not-an-image", href: "http://example.org" },
                            { type: "image", href: "" },
                            { type: "image", href: 123 },
                            { type: "image" },

                            // Valid
                            { type: "image", href: "http://example.com/image" },
                            { type: "image", href: "http://example.com/images/$_12.JPG" },
                            { type: "image", href: "http://example.com/images/$_34.PNG" },
                        ]
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            validateRequest();
            expect(getLargeImageURLSpy).toBeCalledTimes(4);  // +1 for sharingImageUrl (empty)
            expect(adInfo).not.toBeNull();
            expect(adInfo!.images).toEqual([
                "http://example.com/image_large",
                "http://example.com/images/$_12.JPG_large",
                "http://example.com/images/$_34.PNG_large"
            ]);

            getLargeImageURLSpy.mockRestore();
        });

        it.each`
            test               | value                         | expectedValue
            ${"true boolean"}  | ${"true"}                     | ${true}
            ${"false boolean"} | ${"false"}                    | ${false}
            ${"integer"}       | ${"123"}                      | ${123}
            ${"float"}         | ${"1.21"}                     | ${1.21}
            ${"date"}          | ${"2020-09-06T20:52:47.474Z"} | ${new Date("2020-09-06T20:52:47.474Z")}
            ${"string"}        | ${"hello"}                    | ${"hello"}
        `("should scrape attribute ($test)", async ({ value, expectedValue }) => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: {},
                    VIP: {
                        adAttributes: [
                            // Invalid
                            {},
                            { machineKey: 123 },
                            { machineValue: 456 },
                            { machineKey: 123, machineValue: 456 },
                            { machineKey: "invalid", machineValue: 456 },
                            { machineKey: 123, machineValue: "invalid" },

                            // Valid
                            { machineKey: "myAttr", machineValue: value }
                        ]
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.attributes).toEqual({
                myAttr: expectedValue
            });
        });

        it.each`
            test                    | value                | expected
            ${"no amount"}          | ${null}              | ${undefined}
            ${"non-numeric amount"} | ${{ amount: "abc" }} | ${undefined}
            ${"with amount"}        | ${{ amount: 123 }}   | ${1.23}
        `("should scrape price ($test)", async ({ value, expected }) => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: {},
                    VIP: {
                        price: value
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.attributes.price).toBe(expected);
        });

        it("should scrape location", async () => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: {},
                    VIP: {
                        adLocation: "Some location"
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.attributes.location).toBe("Some location");
        });

        it("should scrape type", async () => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: {},
                    VIP: {
                        adType: "Some type"
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.attributes.type).toBe("Some type");
        });

        it("should scrape visits", async () => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: {},
                    VIP: {
                        visitCounter: 12345
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.attributes.visits).toBe(12345);
        });
    });
});