import Foundation

struct PreviewSnapshotFixture: Identifiable {
    let id: String
    let title: String
    let snapshot: AIUsageSnapshot
}

enum PreviewSnapshots {
    static var normal: AIUsageSnapshot {
        fixture("normal")
    }

    static var meterLayout: AIUsageSnapshot {
        fixture("internal_meter_layout")
    }

    static var staleMeterLayout: AIUsageSnapshot {
        fixture("internal_stale_meter_layout")
    }

    static var offline: AIUsageSnapshot {
        fixture("offline")
    }

    static var noCacheFallback: AIUsageSnapshot {
        fixture("degraded")
    }

    static var allFixtures: [PreviewSnapshotFixture] {
        [
            PreviewSnapshotFixture(id: "normal", title: "正常无表", snapshot: fixture("normal")),
            PreviewSnapshotFixture(id: "degraded", title: "用量装神秘/无表", snapshot: fixture("degraded")),
            PreviewSnapshotFixture(id: "offline", title: "Mac 摆烂", snapshot: fixture("offline")),
            PreviewSnapshotFixture(id: "not_logged_in", title: "没登录", snapshot: fixture("not_logged_in")),
            PreviewSnapshotFixture(id: "error", title: "探测翻车", snapshot: fixture("error")),
            PreviewSnapshotFixture(id: "stale", title: "旧账", snapshot: fixture("stale"))
        ]
    }

    private static func fixture(_ id: String) -> AIUsageSnapshot {
        guard let json = jsonById[id] else {
            fatalError("Missing preview fixture: \(id)")
        }
        let data = Data(json.utf8)
        return try! AIUsageSnapshot.decodeValidated(from: data)
    }

    private static let jsonById: [String: String] = [
        "normal": """
        {
          "schemaVersion": 1,
          "device": {
            "id": "mac-stable-id",
            "name": "Kai's Mac",
            "platform": "macOS",
            "connectorVersion": "0.1.0",
            "online": true,
            "updatedAt": "2026-06-11T19:30:00+08:00"
          },
          "providers": [
            {
              "id": "claude",
              "displayName": "Claude",
              "connected": true,
              "health": "working",
              "version": "2.1.170",
              "usage": {
                "available": false,
                "reason": "no_stable_source"
              }
            },
            {
              "id": "codex",
              "displayName": "Codex",
              "connected": true,
              "health": "working",
              "version": "0.139.0",
              "usage": {
                "available": false,
                "reason": "no_stable_source"
              }
            }
          ]
        }
        """,
        "degraded": """
        {
          "schemaVersion": 1,
          "device": {
            "id": "mac-stable-id",
            "name": "Kai's Mac",
            "platform": "macOS",
            "connectorVersion": "0.1.0",
            "online": true,
            "updatedAt": "2026-06-11T19:30:00+08:00"
          },
          "providers": [
            {
              "id": "claude",
              "displayName": "Claude",
              "connected": true,
              "health": "unknown",
              "version": "2.1.170",
              "usage": {
                "available": false,
                "reason": "no_stable_source"
              }
            },
            {
              "id": "codex",
              "displayName": "Codex",
              "connected": true,
              "health": "working",
              "version": "0.139.0",
              "usage": {
                "available": false,
                "reason": "third_party_no_quota"
              }
            }
          ]
        }
        """,
        "offline": """
        {
          "schemaVersion": 1,
          "device": {
            "id": "mac-stable-id",
            "name": "Kai's Mac",
            "platform": "macOS",
            "connectorVersion": "0.1.0",
            "online": false,
            "updatedAt": "2026-06-11T16:30:00+08:00"
          },
          "providers": [
            {
              "id": "claude",
              "displayName": "Claude",
              "connected": true,
              "health": "working",
              "version": "2.1.170",
              "usage": {
                "available": false,
                "reason": "no_stable_source"
              }
            },
            {
              "id": "codex",
              "displayName": "Codex",
              "connected": true,
              "health": "working",
              "version": "0.139.0",
              "usage": {
                "available": false,
                "reason": "no_stable_source"
              }
            }
          ]
        }
        """,
        "not_logged_in": """
        {
          "schemaVersion": 1,
          "device": {
            "id": "mac-stable-id",
            "name": "Kai's Mac",
            "platform": "macOS",
            "connectorVersion": "0.1.0",
            "online": true,
            "updatedAt": "2026-06-11T19:30:00+08:00"
          },
          "providers": [
            {
              "id": "claude",
              "displayName": "Claude",
              "connected": false,
              "health": "unknown",
              "usage": {
                "available": false,
                "reason": "not_logged_in"
              }
            },
            {
              "id": "codex",
              "displayName": "Codex",
              "connected": false,
              "health": "unknown",
              "version": "0.139.0",
              "usage": {
                "available": false,
                "reason": "not_logged_in"
              }
            }
          ]
        }
        """,
        "error": """
        {
          "schemaVersion": 1,
          "device": {
            "id": "mac-stable-id",
            "name": "Kai's Mac",
            "platform": "macOS",
            "connectorVersion": "0.1.0",
            "online": true,
            "updatedAt": "2026-06-11T19:30:00+08:00"
          },
          "providers": [
            {
              "id": "claude",
              "displayName": "Claude",
              "connected": true,
              "health": "error",
              "version": "2.1.170",
              "usage": {
                "available": false,
                "reason": "collector_error"
              },
              "error": {
                "code": "collector_error",
                "message": "codexbar timed out"
              }
            },
            {
              "id": "codex",
              "displayName": "Codex",
              "connected": true,
              "health": "working",
              "version": "0.139.0",
              "usage": {
                "available": false,
                "reason": "no_stable_source"
              }
            }
          ]
        }
        """,
        "stale": """
        {
          "schemaVersion": 1,
          "device": {
            "id": "mac-stable-id",
            "name": "Kai's Mac",
            "platform": "macOS",
            "connectorVersion": "0.1.0",
            "online": true,
            "updatedAt": "2026-06-11T19:30:00+08:00"
          },
          "providers": [
            {
              "id": "claude",
              "displayName": "Claude",
              "connected": true,
              "health": "working",
              "version": "2.1.170",
              "usage": {
                "available": false,
                "reason": "no_stable_source"
              }
            },
            {
              "id": "codex",
              "displayName": "Codex",
              "connected": true,
              "health": "working",
              "version": "0.139.0",
              "usage": {
                "available": false,
                "reason": "no_stable_source"
              }
            }
          ]
        }
        """,
        "internal_meter_layout": """
        {
          "schemaVersion": 1,
          "device": {
            "id": "mac-stable-id",
            "name": "Kai's Mac",
            "platform": "macOS",
            "connectorVersion": "0.1.0",
            "online": true,
            "updatedAt": "2026-06-11T19:30:00+08:00"
          },
          "providers": [
            {
              "id": "claude",
              "displayName": "Claude",
              "connected": true,
              "health": "working",
              "version": "2.1.170",
              "usage": {
                "available": false,
                "reason": "no_stable_source"
              }
            },
            {
              "id": "codex",
              "displayName": "Codex",
              "connected": true,
              "health": "working",
              "version": "0.139.0",
              "capturedAt": "2026-06-11T19:29:41+08:00",
              "usage": {
                "available": true,
                "source": "codexbar",
                "sourceVersion": "1.0.0",
                "fiveHourRemainingPercent": 85,
                "fiveHourResetAt": "2026-06-11T20:30:00+08:00",
                "weeklyRemainingPercent": 27,
                "weeklyResetAt": "2026-06-11T21:45:00+08:00"
              }
            }
          ]
        }
        """,
        "internal_stale_meter_layout": """
        {
          "schemaVersion": 1,
          "device": {
            "id": "mac-stable-id",
            "name": "Kai's Mac",
            "platform": "macOS",
            "connectorVersion": "0.1.0",
            "online": true,
            "updatedAt": "2026-06-11T19:30:00+08:00"
          },
          "providers": [
            {
              "id": "claude",
              "displayName": "Claude",
              "connected": true,
              "health": "working",
              "version": "2.1.170",
              "usage": {
                "available": false,
                "reason": "no_stable_source"
              }
            },
            {
              "id": "codex",
              "displayName": "Codex",
              "connected": true,
              "health": "working",
              "version": "0.139.0",
              "capturedAt": "2026-06-11T15:29:41+08:00",
              "usage": {
                "available": true,
                "source": "codexbar",
                "sourceVersion": "1.0.0",
                "fiveHourRemainingPercent": 85,
                "fiveHourResetAt": "2026-06-11T20:30:00+08:00",
                "weeklyRemainingPercent": 27,
                "weeklyResetAt": "2026-06-11T21:45:00+08:00"
              }
            }
          ]
        }
        """
    ]
}
