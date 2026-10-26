import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from "n8n-workflow";

export class ApishApi implements ICredentialType {
  name = "apishApi";
  displayName = "API.SH API";
  documentationUrl = "https://api.sh/docs/sdks";
  icon = "file:apish.svg" as const;
  properties: INodeProperties[] = [
    { displayName: "API Key", name: "apiKey", type: "string", typeOptions: { password: true }, default: "", required: true, description: "Create a key at https://app.api.sh/keys" },
  ];
  authenticate: IAuthenticateGeneric = { type: "generic", properties: { headers: { "x-api-key": "={{$credentials.apiKey}}" } } };
  test: ICredentialTestRequest = { request: { baseURL: "https://api.api.sh", url: "/v1/account" } };
}
