// @ts-expect-error -- resolved by the pinned deployment CLI invoked outside the workspace.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
