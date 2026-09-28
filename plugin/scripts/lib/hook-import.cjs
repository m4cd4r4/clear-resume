// Loads one hook script. Kept apart from hook-entry.cjs because Node 10 and 11
// reject import() when they parse a file, and hook-entry.cjs must parse on them.
"use strict";

const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

module.exports = (name) => import(pathToFileURL(join(__dirname, "..", `${name}.mjs`)).href);
