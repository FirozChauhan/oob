import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Custom Node server files — plain CommonJS, not part of the Next.js bundle.
    "server.js",
    "db.js",
    "cloudinary.js",
    "firebaseAdmin.js",
  ]),
]);

export default eslintConfig;
