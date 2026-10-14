import "server-only";
import type { ApiOperation } from "../define";
import { adminOperations } from "./admin";
import { agencyOperations } from "./agency";
import { assistantOperations } from "./assistant";
import { catalogOperations } from "./catalog";
import { currencyOperations } from "./currencies";
import { domainOperations } from "./domains";
import { importOperations } from "./imports";
import { giftingOperations } from "./gifting";
import { orderOperations } from "./orders";
import { reportOperations } from "./reports";
import { settingsOperations } from "./settings";
import { shopOperations } from "./shop";
import { sourcingOperations } from "./sourcing";
import { storeContentOperations } from "./store-content";
import { storefrontSectionOperations } from "./storefront-sections";
import { workspaceOperations } from "./workspace";
import { teamOperations } from "./team";
import { webhookOperations } from "./webhooks";

/**
 * The operation modules beyond the first API: each area's REST endpoints and
 * MCP tools, appended to `API_OPERATIONS`.
 */
export const OPS_MODULES: ApiOperation[] = [
  ...settingsOperations,
  ...domainOperations,
  ...webhookOperations,
  ...currencyOperations,
  ...importOperations,
  ...catalogOperations,
  ...storeContentOperations,
  ...storefrontSectionOperations,
  ...workspaceOperations,
  ...orderOperations,
  ...giftingOperations,
  ...sourcingOperations,
  ...assistantOperations,
  ...teamOperations,
  ...agencyOperations,
  ...reportOperations,
  ...adminOperations,
  ...shopOperations,
];
