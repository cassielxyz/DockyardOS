import type { CommunityRegistryIndex } from "./community-types.js";
import type { TrustLevel } from "./types.js";

export interface RemoteRegistrySource {
  id: string;
  displayName: string;
  url: string;
  keyId: string;
  enabled: boolean;
  trustCeiling: TrustLevel;
  maxBytes: number;
  maxAgeSeconds: number;
  allowedHostname: string;
  notes: string[];
}

export interface RemoteRegistrySourcesFile {
  schemaVersion: 1;
  updatedAt: string;
  sources: RemoteRegistrySource[];
}

export interface RegistryTrustKey {
  id: string;
  registryId: string;
  algorithm: "ed25519";
  publicKeyPem: string;
  createdAt: string;
  revokedAt?: string;
}

export interface RegistryTrustStore {
  schemaVersion: 1;
  updatedAt: string;
  keys: RegistryTrustKey[];
}

export interface SignedRegistryEnvelope {
  schemaVersion: 1;
  registryId: string;
  issuedAt: string;
  expiresAt: string;
  sequence: number;
  index: CommunityRegistryIndex;
  signature: {
    algorithm: "ed25519";
    keyId: string;
    value: string;
  };
}

export interface RemoteRegistryCacheRecord {
  schemaVersion: 1;
  sourceId: string;
  registryId: string;
  sequence: number;
  issuedAt: string;
  expiresAt: string;
  fetchedAt: string;
  verifiedAt: string;
  envelopeSha256: string;
  indexSha256: string;
  keyId: string;
  etag?: string;
  lastModified?: string;
  path: string;
}

export interface RemoteRegistrySyncResult {
  sourceId: string;
  status: "updated" | "not-modified";
  record: RemoteRegistryCacheRecord;
  packages: number;
  discoverySources: number;
}
