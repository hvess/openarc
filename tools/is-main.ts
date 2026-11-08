// Whether a module is the script Node was asked to run, as opposed to an import.
//
// Node runs a script by its real path, so a script reached through a symlink (an npm bin,
// a linked checkout) has an import.meta.url that differs from process.argv[1]. Compare
// real paths.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function isMain(moduleUrl: string): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
