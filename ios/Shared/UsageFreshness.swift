import Foundation

enum UsageFreshness {
    static let staleInterval: TimeInterval = 3 * 60 * 60
    static let lastKnownLagInterval: TimeInterval = 5 * 60

    static func isStale(
        snapshotUpdatedAt: Date,
        providerCapturedAt: Date?,
        cacheSavedAt: Date?,
        now: Date
    ) -> Bool {
        let lastCacheWrite = cacheSavedAt ?? snapshotUpdatedAt
        if now.timeIntervalSince(lastCacheWrite) > staleInterval {
            return true
        }

        if now.timeIntervalSince(snapshotUpdatedAt) > staleInterval {
            return true
        }

        guard let providerCapturedAt else {
            return false
        }

        return snapshotUpdatedAt.timeIntervalSince(providerCapturedAt) > staleInterval ||
            now.timeIntervalSince(providerCapturedAt) > staleInterval
    }

    static func isLastKnownFallback(
        snapshotUpdatedAt: Date,
        providerCapturedAt: Date?,
        cacheSource: String?,
        providerId: String
    ) -> Bool {
        if cacheSource?.contains("last-known:\(providerId)") == true ||
            cacheSource?.contains(",\(providerId)") == true {
            return true
        }

        guard let providerCapturedAt else {
            return false
        }

        return snapshotUpdatedAt.timeIntervalSince(providerCapturedAt) > lastKnownLagInterval
    }
}
