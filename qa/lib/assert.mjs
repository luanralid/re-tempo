// qa/lib/assert.mjs — simple asserts with clear messages, accumulated per test.
// -----------------------------------------------------------------------------
// A Checker collects checks {ok, label, detail}. It does not throw: the test decides what
// to do. Useful for the report: each check becomes a readable pass/fail line.
export class Checker {
  constructor() { this.checks = []; }

  _push(ok, label, detail) {
    this.checks.push({ ok: !!ok, label: String(label), detail: detail == null ? "" : String(detail) });
    return ok;
  }
  ok(cond, label, detail) { return this._push(!!cond, label, detail); }
  equal(actual, expected, label) {
    return this._push(actual === expected, label, `expected=${JSON.stringify(expected)} got=${JSON.stringify(actual)}`);
  }
  truthy(v, label) { return this._push(!!v, label, `value=${JSON.stringify(v)}`); }
  atMost(actual, max, label) { return this._push(actual <= max, label, `${actual} <= ${max}`); }
  includes(haystack, needle, label) {
    const ok = Array.isArray(haystack) ? haystack.includes(needle) : String(haystack).includes(needle);
    return this._push(ok, label, `looking for=${JSON.stringify(needle)}`);
  }

  get passed() { return this.checks.filter((c) => c.ok).length; }
  get failed() { return this.checks.filter((c) => !c.ok).length; }
  get allOk() { return this.failed === 0 && this.checks.length > 0; }
}
