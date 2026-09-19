const { cpSync } = require("node:fs");
const { resolve } = require("node:path");

cpSync(resolve(__dirname, "../migrations"), resolve(__dirname, "../dist/migrations"), {
  recursive: true,
});
