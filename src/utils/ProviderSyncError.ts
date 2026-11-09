import type { ProviderId } from "@/config";

export class ProviderSyncError extends Error {
  providerId: ProviderId;

  constructor(message: string, options: { cause?: unknown; providerId: ProviderId }) {
    super(message, { cause: options.cause });
    this.providerId = options.providerId;
    this.name = "ProviderSyncError";
  }
}
