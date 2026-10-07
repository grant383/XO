import { describe, expect, it } from "vitest";
import { generateAuthContract } from "../../scripts/auth-openapi";
import { DISABLED_PATHS } from "@/modules/identity/policy";

describe("generated identity HTTP contract", () => {
  it("uses the real configured endpoints without adding docs endpoints or bearer auth", async () => {
    const schema = await generateAuthContract();
    expect(schema.paths["/api/v1/auth/sign-in/email"]).toBeDefined();
    expect(schema.paths["/api/v1/auth/two-factor/verify-totp"]).toBeDefined();
    for (const path of DISABLED_PATHS)
      expect(schema.paths["/api/v1/auth" + path.replace(/:([A-Za-z]+)/g, "{$1}")]).toBeUndefined();
    expect(schema.paths["/api/v1/auth/open-api/generate-schema"]).toBeUndefined();
    expect(JSON.stringify(schema)).not.toMatch(
      /bearerAuth|openapi-schema-only-synthetic-secret|openapi_fixture|directorxo.openapi.invalid/,
    );
    expect(schema.paths["/api/v1/auth/sign-in/email"]?.post?.security).toEqual([]);
    expect(schema.paths["/api/v1/auth/change-password"]?.post?.security).toEqual([
      { sessionCookie: [] },
    ]);
    expect(schema.schemas.Session?.properties.token?.type).toBe("null");
    expect(
      schema.paths["/api/v1/auth/reset-password"]?.post?.requestBody?.content["application/json"]
        ?.schema.properties?.token?.type,
    ).toBe("string");
  });
});
