/** Server-only story clustering. Nothing under `src/app` should import this in Phase 6. */
export { ALGORITHM_VERSION, THRESHOLDS, WINDOWS_HOURS } from "./config";
export type { EventType, MatchConfidence } from "./config";
export { runClustering, parseWindowMs, CLUSTER_LOCK_KEY } from "./run";
export type { ClusterRunOptions, ClusterRunReport, DecisionRecord } from "./run";
export { listClusters, getCluster, getClusterMembers, listReviewQueue, mergeClusters, moveMember, summarizeSources } from "./queries";
export type { ClusterQuery, StoryClusterView, ClusterMember, ClusterSource, ReviewItem, ClusterSort } from "./queries";
export { collectClusteringHealth } from "./health";
export type { ClusteringHealth } from "./health";
export { decide } from "./decide";
export { extractFeatures } from "./features";
export { scorePair } from "./score";
