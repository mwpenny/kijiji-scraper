module.exports = {
    collectCoverage: true,
    collectCoverageFrom: [
        "lib/**/*.ts"
    ],
    coveragePathIgnorePatterns: [
        "categories.ts",
        "locations.ts"
    ],
    testEnvironment: "node",
    testMatch: [
        "**/test/**.spec.ts"
    ],
    transform: {
        "^.+.ts$": "ts-jest"
    },
    verbose: true
}