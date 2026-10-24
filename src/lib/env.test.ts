import { EnvError, getEnv, readEnv, resetEnvForTests } from "./env";

const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("readEnv", () => {
  it("accepts an absolute http(s) URL and normalises the trailing slash", () => {
    expect(readEnv({ NEXT_PUBLIC_ATLAS_API_BASE_URL: "http://127.0.0.1:8101/" })).toEqual({
      apiBaseUrl: "http://127.0.0.1:8101",
      frontendSha: "unknown",
    });
    expect(
      readEnv({
        NEXT_PUBLIC_ATLAS_API_BASE_URL: "https://api.example.test/atlas/",
        NEXT_PUBLIC_ATLAS_FRONTEND_SHA: SHA,
      }),
    ).toEqual({ apiBaseUrl: "https://api.example.test/atlas", frontendSha: SHA });
  });

  it.each([
    [{}, "is required"],
    [{ NEXT_PUBLIC_ATLAS_API_BASE_URL: "notaurl" }, "is not an absolute URL"],
    [{ NEXT_PUBLIC_ATLAS_API_BASE_URL: "ftp://host" }, "must use http or https"],
    [{ NEXT_PUBLIC_ATLAS_API_BASE_URL: "http://user:pw@host" }, "must not contain credentials"],
    [{ NEXT_PUBLIC_ATLAS_API_BASE_URL: "http://host/?a=1" }, "must not contain a query"],
    [
      { NEXT_PUBLIC_ATLAS_API_BASE_URL: "http://host", NEXT_PUBLIC_ATLAS_FRONTEND_SHA: "main" },
      "40-character",
    ],
  ])("fails fast with a clear message: %j", (source, message) => {
    expect(() => readEnv(source)).toThrow(EnvError);
    expect(() => readEnv(source)).toThrow(message);
  });

  it("getEnv reads the NEXT_PUBLIC_* variables once", () => {
    process.env.NEXT_PUBLIC_ATLAS_API_BASE_URL = "http://localhost:8100";
    resetEnvForTests();
    expect(getEnv().apiBaseUrl).toBe("http://localhost:8100");
    process.env.NEXT_PUBLIC_ATLAS_API_BASE_URL = "http://changed:1";
    expect(getEnv().apiBaseUrl).toBe("http://localhost:8100");
  });
});
