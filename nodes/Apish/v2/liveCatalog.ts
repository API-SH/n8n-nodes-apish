import type { IDataObject, ILoadOptionsFunctions } from "n8n-workflow";
// The endpoint catalog, read live from the API's public /catalog (free, no key) so new platforms, endpoints and prices
// appear without a new package version. Cached in memory for an hour; when the API can't be reached the last copy is
// used, and with none the catalog bundled at build time (catalog.ts).
import { CATALOG } from "../catalog";
import type { Param } from "../types";
import { API_BASE, USER_AGENT } from "../shared";

const HOUR = 3_600_000;

export interface LiveEndpoint { route: string; name: string; credits: number | null }
export interface LivePlatform { slug: string; name: string; endpoints: LiveEndpoint[] }

let listCache: { at: number; platforms: LivePlatform[] } | null = null;
const paramCache = new Map<string, { at: number; params: Param[] }>();

async function getJson(ctx: ILoadOptionsFunctions, qs: IDataObject): Promise<IDataObject> {
  return (await ctx.helpers.httpRequest({ method: "GET", url: `${API_BASE}/catalog`, qs, json: true, timeout: 10_000, headers: { "user-agent": USER_AGENT } })) as IDataObject;
}

const bundledPlatforms = (): LivePlatform[] =>
  CATALOG.map((p) => ({ slug: p.value, name: p.name, endpoints: p.operations.map((o) => ({ route: o.value, name: o.name, credits: o.credits })) }));

/** Platforms and their endpoints with current credits. */
export async function platforms(ctx: ILoadOptionsFunctions): Promise<LivePlatform[]> {
  if (listCache && Date.now() - listCache.at < HOUR) return listCache.platforms;
  try {
    const j = await getJson(ctx, {});
    const list = (Array.isArray(j.platforms) ? j.platforms : []) as LivePlatform[];
    const live = list.filter((p) => p && typeof p.slug === "string" && Array.isArray(p.endpoints) && p.endpoints.length);
    if (!live.length) throw new Error("empty catalog");
    listCache = { at: Date.now(), platforms: live };
    return live;
  } catch {
    return listCache?.platforms ?? bundledPlatforms();
  }
}

/** One endpoint's parameters (from /catalog?route=). */
export async function params(ctx: ILoadOptionsFunctions, route: string): Promise<Param[] | null> {
  const hit = paramCache.get(route);
  if (hit && Date.now() - hit.at < HOUR) return hit.params;
  try {
    const j = await getJson(ctx, { route });
    const ep = j.endpoint as IDataObject | undefined;
    if (!ep || !Array.isArray(ep.params)) throw new Error("no endpoint");
    const list = (ep.params as IDataObject[]).map((x) => ({
      name: String(x.name),
      required: !!x.required,
      type: String(x.type ?? "string"),
      description: String(x.description ?? ""),
      example: x.example == null ? undefined : String(x.example),
      enum: Array.isArray(x.enum) && x.enum.length ? x.enum.map(String) : undefined,
      default: x.default == null ? undefined : String(x.default),
    }));
    paramCache.set(route, { at: Date.now(), params: list });
    return list;
  } catch {
    if (hit) return hit.params;
    for (const p of CATALOG) for (const o of p.operations) if (o.value === route) return o.params;
    return null;
  }
}

/** For tests: forget the cached catalog. */
export function clearCache(): void {
  listCache = null;
  paramCache.clear();
}
