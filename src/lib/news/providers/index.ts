import { localNewsProvider } from "./local-provider";
import type { NewsProvider } from "./types";

export type { NewsProvider, NewsProviderQuery } from "./types";
export { localNewsProvider } from "./local-provider";

/** All registered providers. Phase 1 ships one; future ingestion sources register here. */
export const newsProviders: NewsProvider[] = [localNewsProvider];

export const defaultNewsProvider: NewsProvider = localNewsProvider;
