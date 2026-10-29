# n8n-nodes-apish

The [API.SH](https://api.sh) node for [n8n](https://n8n.io): public web data from TikTok, Instagram, YouTube, Amazon, Zillow, Google and 150+ other platforms as clean JSON, inside your workflows. One node, one credential, 700+ endpoints.

## Install

- **n8n (self-hosted or Cloud):** Settings → Community Nodes → Install → enter `n8n-nodes-apish` → Install.
- Then search the node panel for **API.SH**.

## Credentials

1. Sign up at [app.api.sh](https://app.api.sh) (100 free credits every month) and create an API key under **API keys**.
2. In n8n, add an **API.SH API** credential and paste the key. n8n checks it against `GET https://api.api.sh/v1/account`.

The key is sent in the `x-api-key` header to `https://api.api.sh` only.

## Use

1. Add the **API.SH** node.
2. Pick a **Platform** (e.g. TikTok) and an **Endpoint** (e.g. *TikTok profile*). Each endpoint shows its current price in credits.
3. Fill in the endpoint's **Parameters** (e.g. `username`: `nasa`).
4. Optional **Options**:
   - **Split Into Items:** one n8n item per record (per search result, review, post…) instead of one item per call.
   - **Fields:** return only these fields, e.g. `posts.title,posts.url`.
   - **Include Raw Source Data:** keep the bulky raw blocks (off by default).
   - **Fresh:** skip the 24-hour cache and fetch live.

The **Account** platform reads your balance and spend, usage per day, recent call logs, and the response of an earlier call again (all free).

Every item carries `_apish.request_id` and `_apish.credits_used`. Failed calls return n8n errors with API.SH's message; turn on *Continue On Fail* to keep going. The node can also be used as a tool by n8n AI agents.

## Always up to date

Since version 0.3.0 (node version 2) the platform and endpoint lists come live from API.SH's public catalog (`GET https://api.api.sh/catalog`, free, no key), and each endpoint's parameters from `/catalog?route=…`, cached for an hour. New platforms, new endpoints and price changes show up without updating the package. If api.api.sh can't be reached while you edit, the node falls back to the list bundled in the package. Running a workflow doesn't read the catalog.

Nodes added before 0.3.0 stay on node version 1 (the bundled list, one field per parameter) and keep running unchanged. To switch one to version 2, add a new API.SH node and pick the same platform and endpoint.

## Example workflow

[`examples/tiktok-profile.json`](examples/tiktok-profile.json): Manual Trigger → API.SH (TikTok profile of `nasa`). Import it with *Workflows → Import from File*, then select your API.SH credential.

## Pricing

You pay in API.SH credits: you pay for calls that run, at the endpoint's price (most cost 1 credit). Calls refused before they run (a missing parameter, a wrong key) and errors on our side are free. See [api.sh/pricing](https://api.sh/pricing).

## Links

- Docs: [api.sh/docs](https://api.sh/docs) · n8n guide: [api.sh/docs/sdks#n8n](https://api.sh/docs/sdks#n8n)
- Endpoint catalog: [api.sh/catalog](https://api.sh/catalog)
- Support: support@api.sh

## License

MIT
