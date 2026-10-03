import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Modular-monolith boundaries (see docs/adr/0006-modular-monolith-layout.md):
 * - platform/* is infrastructure: it never imports domain modules or the app layer.
 * - modules/* expose a public index.ts; other code imports `@/modules/<name>` only.
 * - Raw database clients live in platform/db/internal and are never imported elsewhere,
 *   so all data access goes through tenant/service-scoped transaction wrappers.
 */
const noDeepModuleImports = {
  group: ["@/modules/*/*"],
  message: "Import a module through its public index: `@/modules/<name>`.",
};
const noRawDb = {
  group: ["@/platform/db/internal", "@/platform/db/internal/*", "**/db/internal/*"],
  message:
    "Use withTenant/withUser/withService from `@/platform/db`; raw clients bypass tenant context.",
};

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "db/migrations/**", "next-env.d.ts"],
  },
  {
    files: ["src/app/**", "worker/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noDeepModuleImports, noRawDb] }],
    },
  },
  {
    files: ["src/modules/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            noRawDb,
            { group: ["@/app/*"], message: "Domain modules must not depend on the app layer." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/platform/**"],
    ignores: ["src/platform/db/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            noRawDb,
            {
              group: ["@/modules/*", "@/app/*"],
              message: "Platform code must not depend on domain modules or the app layer.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/platform/db/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*", "@/app/*"],
              message: "Platform code must not depend on domain modules or the app layer.",
            },
          ],
        },
      ],
    },
  },
];

export default config;
