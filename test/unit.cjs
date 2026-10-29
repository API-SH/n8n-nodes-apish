// Unit test with a fake n8n context (no network). node test/unit.cjs
// APISH_LIVE=1 node test/unit.cjs also reads the real https://api.api.sh/catalog.
const assert = require("node:assert/strict");
const { Apish } = require("../dist/nodes/Apish/Apish.node.js");
const { ApishApi } = require("../dist/credentials/ApishApi.credentials.js");
const live = require("../dist/nodes/Apish/v2/liveCatalog.js");

const node = new Apish();
assert.equal(node.description.defaultVersion, 2);
assert.equal(node.currentVersion, 2);
const v1 = node.getNodeType(1);
const v2 = node.getNodeType(2);
assert.equal(v1.description.version, 1);
assert.equal(v2.description.version, 2);
assert.equal(v2.description.icon, "file:apish.svg");
assert.equal(new ApishApi().authenticate.properties.headers["x-api-key"], "={{$credentials.apiKey}}");

// version 1: unchanged, one property per bundled endpoint parameter
const d1 = v1.description;
assert.ok(d1.properties.length > 300, "one property per endpoint parameter");
assert.equal(new Set(d1.properties.filter((p) => p.name === "operation").map((p) => JSON.stringify(p.displayOptions))).size, d1.properties.filter((p) => p.name === "operation").length, "one operation list per platform");
assert.ok(d1.properties.some((p) => p.name === "p_username"));

// version 2: a handful of properties, everything else loaded at edit time
const d2 = v2.description;
assert.ok(d2.properties.length < 15, "no bundled per-endpoint properties in v2");
assert.equal(d2.properties.find((p) => p.name === "resource").typeOptions.loadOptionsMethod, "getPlatforms");
assert.equal(d2.properties.find((p) => p.typeOptions?.loadOptionsMethod === "getEndpoints").name, "operation");
assert.equal(d2.properties.find((p) => p.name === "parameters").typeOptions.resourceMapper.resourceMapperMethod, "getParameters");

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
// load-options context; http(opts) plays api.api.sh/catalog
function lctx(params, http) {
  const calls = [];
  return { calls, getCurrentNodeParameter: (n) => params[n], helpers: { httpRequest: async (opts) => { calls.push(opts); return http(opts); } } };
}
const LIST = { version: "t", platforms: [{ slug: "newsite", name: "New Site", category: "x", endpoints: [{ route: "/newsite/v1/item", name: "New Site item", credits: 2 }] }, { slug: "tiktok", name: "TikTok", category: "social", endpoints: [{ route: "/tiktok/v1/profile", name: "TikTok profile", credits: 1 }] }] };
const ROUTE = { version: "t", platform: { slug: "newsite", name: "New Site" }, endpoint: { route: "/newsite/v1/item", name: "New Site item", credits: 2, params: [{ name: "url", required: true, type: "string", example: "https://newsite.com/i/1" }, { name: "sort", required: false, type: "string", enum: ["new", "top"], default: "new" }, { name: "limit", required: false, type: "integer" }] }, common_params: [] };
const offline = async () => { throw new Error("offline"); };

(async () => {
  // v1 execution, as before
  const c = ctx({ resource: "tiktok", operation: "/tiktok/v1/profile", p_username: "nasa", options: { fresh: true } }, { body: { username: "nasa" }, headers: { "x-request-id": "r1", "x-credits-used": "1" } });
  const [out] = await v1.execute.call(c);
  assert.equal(c.sent[0].cred, "apishApi");
  assert.equal(c.sent[0].opts.url, "https://api.api.sh/tiktok/v1/profile");
  assert.deepEqual(c.sent[0].opts.qs, { username: "nasa", raw: "0", fresh: "1" });
  assert.equal(out[0].json.username, "nasa"); assert.equal(out[0].json._apish.request_id, "r1");

  const s = ctx({ resource: "reddit", operation: "/reddit/v1/subreddit", p_subreddit: "python", options: { split: true } }, { body: { subreddit: "python", posts: [{ id: 1 }, { id: 2 }] }, headers: {} });
  const [out2] = await v1.execute.call(s);
  assert.deepEqual(out2.map((x) => x.json.id), [1, 2]);

  const a = ctx({ resource: "account", operation: "/v1/results", requestId: "abc" }, { body: { ok: 1 }, headers: {} });
  await v1.execute.call(a);
  assert.equal(a.sent[0].opts.url, "https://api.api.sh/v1/results/abc");

  // v2 load options from the live catalog
  const m = v2.methods;
  live.clearCache();
  let l = lctx({}, async (o) => { assert.equal(o.url, "https://api.api.sh/catalog"); return LIST; });
  const plats = await m.loadOptions.getPlatforms.call(l);
  assert.deepEqual(plats.map((p) => p.value), ["account", "newsite", "tiktok"]);
  await m.loadOptions.getPlatforms.call(l);
  assert.equal(l.calls.length, 1, "catalog cached");
  l = lctx({ resource: "newsite" }, offline); // served from the cache
  const eps = await m.loadOptions.getEndpoints.call(l);
  assert.deepEqual(eps, [{ name: "New Site item", value: "/newsite/v1/item", description: "/newsite/v1/item · 2 credits" }]);

  l = lctx({ operation: "/newsite/v1/item" }, async (o) => { assert.deepEqual(o.qs, { route: "/newsite/v1/item" }); return ROUTE; });
  const { fields } = await m.resourceMapping.getParameters.call(l);
  assert.deepEqual(fields.map((f) => [f.id, f.required, f.type]), [["url", true, "string"], ["sort", false, "options"], ["limit", false, "number"]]);
  assert.deepEqual(fields[1].options.map((o) => o.value), ["new", "top"]);
  assert.equal(fields[1].defaultValue, "new");

  // v2 load options with the API unreachable and nothing cached: the bundled catalog
  live.clearCache();
  l = lctx({ resource: "tiktok", operation: "/tiktok/v1/profile" }, offline);
  const offPlats = await m.loadOptions.getPlatforms.call(l);
  assert.ok(offPlats.length > 50 && offPlats.some((p) => p.value === "tiktok"));
  assert.ok((await m.loadOptions.getEndpoints.call(l)).some((e) => e.value === "/tiktok/v1/profile"));
  assert.deepEqual((await m.resourceMapping.getParameters.call(l)).fields.map((f) => f.id), ["username"]);
  l = lctx({ operation: "/nope/v1/x" }, offline);
  assert.equal((await m.resourceMapping.getParameters.call(l)).fields.length, 0);

  // v2 execution: route and mapped values as saved, no catalog needed
  const c2 = ctx({ resource: "newsite", operation: "/newsite/v1/item", parameters: { mappingMode: "defineBelow", value: { url: "https://newsite.com/i/1", sort: "", limit: 5, extra: null } }, options: { split: false } }, { body: { id: 1 }, headers: { "x-credits-used": "2" } });
  const [out3] = await v2.execute.call(c2);
  assert.equal(c2.sent[0].opts.url, "https://api.api.sh/newsite/v1/item");
  assert.deepEqual(c2.sent[0].opts.qs, { url: "https://newsite.com/i/1", limit: 5, raw: "0" });
  assert.equal(out3[0].json._apish.credits_used, 2);

  const bad = ctx({ resource: "x", operation: "https://evil.example/" }, { body: {}, headers: {} });
  await assert.rejects(() => v2.execute.call(bad), /Pick an endpoint/);
  assert.equal(bad.sent.length, 0);

  const a2 = ctx({ resource: "account", operation: "/v1/account/usage", days: 7 }, { body: { ok: 1 }, headers: {} });
  await v2.execute.call(a2);
  assert.deepEqual([a2.sent[0].opts.url, a2.sent[0].opts.qs], ["https://api.api.sh/v1/account/usage", { days: 7 }]);

  if (process.env.APISH_LIVE) {
    live.clearCache();
    const real = { helpers: { httpRequest: async (o) => { const u = new URL(o.url); for (const [k, v] of Object.entries(o.qs || {})) u.searchParams.set(k, v); const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return r.json(); } } };
    const p = await m.loadOptions.getPlatforms.call({ ...real, getCurrentNodeParameter: () => undefined });
    const e = await m.loadOptions.getEndpoints.call({ ...real, getCurrentNodeParameter: () => "tiktok" });
    const f = await m.resourceMapping.getParameters.call({ ...real, getCurrentNodeParameter: () => "/tiktok/v1/profile" });
    assert.ok(p.length > 100 && e.length > 5 && f.fields.some((x) => x.id === "username" && x.required));
    console.log(`live catalog ok: ${p.length - 1} platforms, ${e.length} TikTok endpoints`);
  }
  console.log(`n8n node ok: v1 ${d1.properties.length} properties, v2 ${d2.properties.length} properties`);
})().catch((e) => { console.error(e); process.exit(1); });
