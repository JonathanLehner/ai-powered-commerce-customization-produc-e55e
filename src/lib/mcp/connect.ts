import { SITE_ORIGIN } from "../seo";

/**
 * What a merchant pastes into an AI assistant to connect it to their store,
 * shown on /developers and on the store's API keys page. Plain strings, so the
 * pages stay static and the check script reads the same values.
 */

export const MCP_URL = `${SITE_ORIGIN}/api/mcp`;
export const API_BASE_URL = `${SITE_ORIGIN}/api/v1`;
export const OPENAPI_URL = `${API_BASE_URL}/openapi.json`;

/** Stands in for the secret in every snippet. */
export const KEY_PLACEHOLDER = "YOUR_API_KEY";

export function mcpSnippets(key = KEY_PLACEHOLDER) {
  const header = `Authorization: Bearer ${key}`;
  return {
    url: MCP_URL,
    header,
    claudeCode: `claude mcp add --transport http parcelith ${MCP_URL} \\\n  --header "${header}"`,
    json: JSON.stringify(
      { mcpServers: { parcelith: { type: "http", url: MCP_URL, headers: { Authorization: `Bearer ${key}` } } } },
      null,
      2,
    ),
  };
}

export function restExample(storeId: string, key = KEY_PLACEHOLDER) {
  return `curl ${API_BASE_URL}/stores/${storeId}/products \\\n  -H "Authorization: Bearer ${key}"`;
}

/** The MCP server for shopping agents, one store per connection. */
export function shopMcpUrl(storeHandle: string) {
  return `${SITE_ORIGIN}/api/mcp/shop?store=${storeHandle}`;
}

export function shopRestExample(storeHandle: string) {
  return `curl ${API_BASE_URL}/shop/${storeHandle}/products?locale=en`;
}
