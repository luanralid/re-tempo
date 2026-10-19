# qa/

Automated tests for RE-TEMPO. They drive isolated instances over CDP, in parallel, under `/tmp/tempo-qa/`. They never touch your window or your Tempo profile.

```sh
npm install                                    # playwright-core
node run.mjs --suite 00-smoke --instances 3    # logged out, 3 in parallel
node login.mjs --profiles 2                    # logged-in profiles qa-1, qa-2 (you approve in the browser)
node run.mjs --suite 01-smoke-logged-in --profiles qa-1,qa-2
node ps.mjs                                    # live instances; node clean.mjs --all to clean up
```

`suites/` holds the tests, `lib/` the harness, and `changelog/` the capture scripts for [docs/changes](../docs/changes/README.md). Reports land in `/tmp/tempo-qa/runs/<timestamp>/`. Full docs: [docs/qa/03-harness.md](../docs/qa/03-harness.md).
