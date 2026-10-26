// Unit test with a fake n8n context (no network). node test/unit.cjs
const assert = require("node:assert/strict");
const { Apish } = require("../dist/nodes/Apish/Apish.node.js");
const { ApishApi } = require("../dist/credentials/ApishApi.credentials.js");

const node = new Apish();
const d = node.description;
const names = d.properties.map((p) => p.name);
assert.ok(d.properties.length > 300, "one property per endpoint parameter");
assert.equal(new Set(d.properties.filter((p) => p.name === "operation").map((p) => JSON.stringify(p.displayOptions))).size, d.properties.filter((p) => p.name === "operation").length, "one operation list per platform");
assert.ok(names.includes("p_username"));
assert.equal(new ApishApi().authenticate.properties.headers["x-api-key"], "={{$credentials.apiKey}}");

function ctx(params, reply) {
  const sent = [];
  return {
    sent,
    getInputData: () => [{ json: {} }],
    getNodeParameter: (name, _i, def) => (name in params ? params[name] : def),
    getNode: () => ({ name: "api.sh" }),
    continueOnFail: () => false,
    helpers: { httpRequestWithAuthentication: async function (cred, opts) { sent.push({ cred, opts }); return reply; } },
  };
}
(async () => {
  const c = ctx({ resource: "tiktok", operation: "/tiktok/v1/profile", p_username: "nasa", options: { fresh: true } }, { body: { username: "nasa" }, headers: { "x-request-id": "r1", "x-credits-used": "1" } });
  const [out] = await node.execute.call(c);
  assert.equal(c.sent[0].cred, "apishApi");
  assert.equal(c.sent[0].opts.url, "https://api.api.sh/tiktok/v1/profile");
  assert.deepEqual(c.sent[0].opts.qs, { username: "nasa", raw: "0", fresh: "1" });
  assert.equal(out[0].json.username, "nasa"); assert.equal(out[0].json._apish.request_id, "r1");

  const s = ctx({ resource: "reddit", operation: "/reddit/v1/subreddit", p_subreddit: "python", options: { split: true } }, { body: { subreddit: "python", posts: [{ id: 1 }, { id: 2 }] }, headers: {} });
  const [out2] = await node.execute.call(s);
  assert.deepEqual(out2.map((x) => x.json.id), [1, 2]);

  const a = ctx({ resource: "account", operation: "/v1/results", requestId: "abc" }, { body: { ok: 1 }, headers: {} });
  await node.execute.call(a);
  assert.equal(a.sent[0].opts.url, "https://api.api.sh/v1/results/abc");
  console.log(`n8n node ok: ${d.properties.length} properties`);
})().catch((e) => { console.error(e); process.exit(1); });
