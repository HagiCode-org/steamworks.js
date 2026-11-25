#!/usr/bin/env node
// Entry point of the `swjs` executable. All behavior lives in src/; this file only hands over argv and sets the exit code.
import { main } from '../src/cli.mjs'

process.exitCode = await main(process.argv.slice(2))
