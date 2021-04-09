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
                    "Accept-Language": "en-CA",
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

    it("should detect ban", async () => {
        fetchSpy.mockResolvedValue({ status: 403 });

        try {
            await scraper("http://example.com");
            fail("Expected error for ban");
        } catch (err) {
            expect(err.message).toBe(
                "Kijiji denied access. You are likely temporarily blocked. This " +
                "can happen if you scrape too aggressively. Try scraping again later, " +
                "and more slowly. If this happens even when scraping reasonably, please " +
                "open an issue at: https://github.com/mwpenny/kijiji-scraper/issues"
            )
            validateRequest();
        }
    });

    it.each`
        test                         | html
        ${"Bad markup"}              | ${"Bad markup"}
        ${"Missing FesLoader"}       | ${"<html></html>"}
        ${"Empty FesLoader"}         | ${createAdHTML({})}
        ${"Missing config property"} | ${createAdHTML({ abc: 123 })}
        ${"Missing adInfo property"} | ${createAdHTML({ config: {} })}
        ${"Missing VIP property"}    | ${createAdHTML({ config: { adInfo: {} } })}
        ${"Missing ID"}              | ${createAdHTML({ config: { adInfo: {}, VIP: {} } })}
        ${"Missing title"}           | ${createAdHTML({ config: { adInfo: {}, VIP: { adId: 1234 } } })}
        ${"Missing date"}            | ${createAdHTML({ config: { adInfo: { title: "Test" }, VIP: { adId: 1234 } } })}
    `("should fail to scrape invalid HTML ($test)", async ({ html }) => {
        mockResponse(html);

        const adInfo = await scraper("http://example.com");
        validateRequest();
        expect(adInfo).toBeNull();
    });

    describe("valid markup", () => {
        it("should scrape ID", async () => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: { title: "My ad title" },
                    VIP: {
                        adId: 123,
                        sortingDate: Date.now()
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.id).toBe("123");
        });

        it("should scrape title", async () => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: { title: "My ad title" },
                    VIP: {
                        adId: 123,
                        sortingDate: Date.now()
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.title).toBe("My ad title");
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
                    adInfo: { title: "My ad title" },
                    VIP: {
                        adId: 123,
                        sortingDate: Date.now(),
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
                    adInfo: { title: "My ad title" },
                    VIP: {
                        adId: 123,
                        sortingDate: date.getTime()
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
                        title: "My ad title",
                        sharingImageUrl: "some image URL"
                    },
                    VIP: {
                        adId: 123,
                        sortingDate: Date.now()
                    }
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
                    adInfo: { title: "My ad title" },
                    VIP: {
                        adId: 123,
                        sortingDate: Date.now(),
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

        describe("attribute scraping", () => {
            it.each`
                test               | value                         | expectedValue
                ${"undefined"}     | ${undefined}                  | ${undefined}
                ${"true boolean"}  | ${"true"}                     | ${true}
                ${"false boolean"} | ${"false"}                    | ${false}
                ${"integer"}       | ${"123"}                      | ${123}
                ${"float"}         | ${"1.21"}                     | ${1.21}
                ${"date"}          | ${"2020-09-06T20:52:47.474Z"} | ${new Date("2020-09-06T20:52:47.474Z")}
                ${"string"}        | ${"hello"}                    | ${"hello"}
                ${"empty string"}  | ${""}                         | ${""}
            `("should scrape attribute ($test)", async ({ value, expectedValue }) => {
                mockResponse(createAdHTML({
                    config: {
                        adInfo: { title: "My ad title" },
                        VIP: {
                            adId: 123,
                            sortingDate: Date.now(),
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
                test                               | value    | localeSpecificValues       | expectedValue
                ${"localized integer"}             | ${"15"}  | ${{ en: { value: "1.5" }}} | ${1.5}
                ${"localized float"}               | ${"2.3"} | ${{ en: { value: "23" }}}  | ${23}
                ${"non-numeric localized integer"} | ${"4"}   | ${{ en: { value: "hi" }}}  | ${4}
                ${"non-numeric localized float"}   | ${"8.1"} | ${{ en: { value: "bye" }}} | ${8.1}
                ${"no locale-specific values"}     | ${"123"} | ${undefined}               | ${123}
                ${"no English localization"}       | ${"456"} | ${{}}                      | ${456}
                ${"no English value"}              | ${"789"} | ${{ en: {} }}              | ${789}
            `("should scrape numeric attributes with localization ($test)", async ({ value, localeSpecificValues, expectedValue }) => {
                mockResponse(createAdHTML({
                    config: {
                        adInfo: { title: "My ad title" },
                        VIP: {
                            adId: 123,
                            sortingDate: Date.now(),
                            adAttributes: [{
                                machineKey: "myAttr",
                                machineValue: value,
                                localeSpecificValues
                            }]
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
        });

        it.each`
            test                    | value                | expected
            ${"no amount"}          | ${null}              | ${undefined}
            ${"non-numeric amount"} | ${{ amount: "abc" }} | ${undefined}
            ${"with amount"}        | ${{ amount: 123 }}   | ${1.23}
        `("should scrape price ($test)", async ({ value, expected }) => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: { title: "My ad title" },
                    VIP: {
                        adId: 123,
                        sortingDate: Date.now(),
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
                    adInfo: { title: "My ad title" },
                    VIP: {
                        adId: 123,
                        sortingDate: Date.now(),
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
                    adInfo: { title: "My ad title" },
                    VIP: {
                        adId: 123,
                        sortingDate: Date.now(),
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
                    adInfo: { title: "My ad title" },
                    VIP: {
                        adId: 123,
                        sortingDate: Date.now(),
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