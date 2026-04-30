import { readFileSync, writeFileSync } from "node:fs";

const path = "dist/index.d.ts";
const ref = '/// <reference types="node" />\n';
const body = readFileSync(path, "utf8");
if (!body.startsWith(ref)) {
  writeFileSync(path, ref + body);
}
