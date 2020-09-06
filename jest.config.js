module.exports = {
    collectCoverage: true,
    collectCoverageFrom: [
        "lib/*.js"
    ],
    testEnvironment: "node",
    testMatch: [
        "**/test/**.spec.js"
    ],
    verbose: true
}