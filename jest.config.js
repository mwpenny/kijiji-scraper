module.exports = {
    collectCoverage: true,
    collectCoverageFrom: [
        "lib/**/*.ts"
    ],
    coveragePathIgnorePatterns: [
        "categories.ts",
        "locations.ts"
    ],
    globals: {
        "ts-jest": {
            tsconfig: {
                target: "es2019"
            }
        }
    },
    testEnvironment: "node",
    testMatch: [
        "**/test/**.spec.ts"
    ],
    transform: {
        "^.+.ts$": "ts-jest"
    },
    verbose: true
}