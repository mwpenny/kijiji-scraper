jest.mock("node-fetch");

const fetchSpy = require("node-fetch");

const scraper = require("../scraper");

describe("Ad HTML scraper", () => {
    afterEach(() => {
        jest.resetAllMocks();
    });

    const mockResponse = (body) => {
        fetchSpy.mockResolvedValue({
            text: () => body
        });
    };

    const createAdHTML = (info) => {
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
        url
        ${null}
        ${undefined}
        ${""}
    `("should throw error if URL is not passed (url=$url)", async ({ url }) => {
        try {
            await scraper(url);
            fail("Expected error for bad URL");
        } catch (err) {
            expect(err.message).toBe("URL must be specified");
            expect(fetchSpy).not.toBeCalled();
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
    `("should throw error for invalid HTML ($test)", async ({ html }) => {
        mockResponse(html);

        try {
            await scraper("http://example.com");
            fail("Expected error for bad HTML");
        } catch (err) {
            expect(err.message).toBe("Ad not found or invalid Kijiji HTML at http://example.com");
        }
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
            expect(adInfo.title).toBe("My ad title");;
        });

        it.each`
            test                | description
            ${"well formatted"} | ${"My ad description"}
            ${"with label"}     | ${"My ad <label>blah</label>description"}
            ${"untrimmed"}      | ${"  \n\n  My ad description      \r\n"}
        `("should scrape description ($test)", async ({ description }) => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: {},
                    VIP: {
                        description
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            expect(adInfo.description).toBe("My ad description");
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
            expect(adInfo.date).toEqual(date);
        });

        it.each`
            test             | url                                     | expectedUrl
            ${"null URL"}    | ${null}                                 | ${""}
            ${"regular URL"} | ${"http://example.com"}                 | ${"http://example.com"}
            ${"upsize JPG"}  | ${"http://example.com/images/$_12.JPG"} | ${"http://example.com/images/$_57.JPG"}
            ${"upsize PNG"}  | ${"http://example.com/images/$_34.PNG"} | ${"http://example.com/images/$_57.JPG"}
        `("should scrape image ($test)", async ({ url, expectedUrl }) => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: {
                        sharingImageUrl: url
                    },
                    VIP: {}
                }
            }));

            const adInfo = await scraper("http://example.com");
            expect(adInfo.image).toBe(expectedUrl);
        });

        it("should scrape ad images", async () => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: {},
                    VIP: {
                        media: [
                            { type: "not-an-image", href: "http://example.org" },
                            { type: "image", href: "http://example.com/image" },
                            { type: "image", href: "http://example.com/images/$_12.JPG" },
                            { type: "image", href: "http://example.com/images/$_34.PNG" },
                        ]
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            expect(adInfo.images).toEqual([
                "http://example.com/image",
                "http://example.com/images/$_57.JPG",
                "http://example.com/images/$_57.JPG",
            ]);
        });

        it.each`
            test               | value                         | expectedValue
            ${"true boolean"}  | ${"true"}                     | ${true}
            ${"false boolean"} | ${"false"}                    | ${false}
            ${"integer"}       | ${"123"}                      | ${123}
            ${"float"}         | ${"1.21"}                     | ${1.21}
            ${"date"}          | ${"2020-09-06T20:52:47.474Z"} | ${new Date(1599425567474)}
            ${"string"}        | ${"hello"}  | ${"hello"}
        `("should scrape ad attribute ($test)", async ({ value, expectedValue }) => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: {},
                    VIP: {
                        adAttributes: [
                            { machineKey: "myAttr", machineValue: value }
                        ]
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            expect(adInfo.attributes).toEqual({
                myAttr: expectedValue
            });
        });

        it("should scrape images", async () => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: {},
                    VIP: {
                        media: [
                            { type: "image", href: "http://example.com/image1" },
                            { type: "image", href: "http://example.com/image2" }
                        ]
                    }
                }
            }));

            const adInfo = await scraper("http://example.com");
            expect(adInfo.images).toEqual([
                "http://example.com/image1",
                "http://example.com/image2"
            ]);
        });

        it.each`
            test             | value              | expected
            ${"no amount"}   | ${null}            | ${undefined}
            ${"with amount"} | ${{ amount: 123 }} | ${1.23}
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
            expect(adInfo.attributes.price).toBe(expected);
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
            expect(adInfo.attributes.location).toBe("Some location");
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
            expect(adInfo.attributes.type).toBe("Some type");
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
            expect(adInfo.attributes.visits).toBe(12345);
        });

        it("should set URL", async () => {
            mockResponse(createAdHTML({
                config: {
                    adInfo: {},
                    VIP: {}
                }
            }));

            const adInfo = await scraper("http://example.com");
            expect(adInfo.url).toBe("http://example.com");
        });
    });
});