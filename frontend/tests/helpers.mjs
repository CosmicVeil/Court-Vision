// Shared file readers for the source-assertion tests.
import { existsSync, readFileSync } from "node:fs";

const FRONTEND = new URL("../", import.meta.url);
const REPO = new URL("../../", import.meta.url);

/** Read a file relative to frontend/ (e.g. "src/App.jsx", "vite.config.js"). */
export const readFrontend = (path) => readFileSync(new URL(path, FRONTEND), "utf8");

/** Read a file relative to the repository root (e.g. "backend/main.py"). */
export const readRepo = (path) => readFileSync(new URL(path, REPO), "utf8");

/** Read a page or component by file name, wherever it lives under src/pages or src/components. */
export function readSource(filename) {
  for (const dir of ["src/pages/", "src/components/"]) {
    const url = new URL(dir + filename, FRONTEND);
    if (existsSync(url)) return readFileSync(url, "utf8");
  }
  throw new Error(`${filename} not found in src/pages or src/components`);
}
