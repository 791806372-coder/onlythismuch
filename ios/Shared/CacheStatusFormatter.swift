import Foundation

enum CacheStatusFormatter {
    static func caption(
        source: String?,
        savedAt: Date?,
        fallbackDate: Date,
        now: Date = Date(),
        language: AppLanguageOption = .simplifiedChinese
    ) -> String {
        let date = savedAt ?? fallbackDate
        if let source, isWiFiSource(source) {
            return wiFiFreshnessCaption(from: date, now: now, language: language)
        }
        return "\(sourceLabel(source, language: language)) · \(ageCaption(from: date, now: now, language: language))"
    }

    static func sourceLabel(_ source: String?, language: AppLanguageOption = .simplifiedChinese) -> String {
        guard let source else {
            return cacheLabel(language)
        }

        if isWiFiSource(source) {
            return "Wi-Fi"
        }
        if source.hasPrefix("fixture:") {
            return "Fixture"
        }
        return cacheLabel(language)
    }

    private static func wiFiFreshnessCaption(
        from date: Date,
        now: Date,
        language: AppLanguageOption
    ) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(date)))

        if seconds < 90 {
            switch language {
            case .english:
                return "Touched Mac · hot😏"
            case .simplifiedChinese:
                return "刚摸完，很润😏"
            case .traditionalChinese:
                return "剛摸完，很潤😏"
            case .spanish:
                return "Mac tocado · caliente😏"
            case .portuguese:
                return "Mac tocado · quente😏"
            case .japanese:
                return "なでたて、しっとり😏"
            }
        }

        let minutes = seconds / 60
        if minutes < 60 {
            switch language {
            case .english:
                return "Touched Mac · warm \(minutes)m😏"
            case .simplifiedChinese:
                return "\(minutes)分钟前摸过😏"
            case .traditionalChinese:
                return "\(minutes)分鐘前摸過😏"
            case .spanish:
                return "Mac tocado · tibio \(minutes) min😏"
            case .portuguese:
                return "Mac tocado · morno \(minutes) min😏"
            case .japanese:
                return "\(minutes)分前になでた😏"
            }
        }

        let hours = minutes / 60
        if hours < 24 {
            switch language {
            case .english:
                return "Touched Mac · warm \(hours)h😏"
            case .simplifiedChinese:
                return "\(hours)小时前摸过😏"
            case .traditionalChinese:
                return "\(hours)小時前摸過😏"
            case .spanish:
                return "Mac tocado · tibio \(hours) h😏"
            case .portuguese:
                return "Mac tocado · morno \(hours) h😏"
            case .japanese:
                return "\(hours)時間前になでた😏"
            }
        }

        return localized(
            language,
            english: "not sure · need touching😏",
            simplified: "不确定了，得再摸😏",
            traditional: "不確定了，得再摸😏",
            spanish: "ni idea · necesita toque😏",
            portuguese: "sei lá · precisa de toque😏",
            japanese: "もう不明、またなでて😏"
        )
    }

    private static func isWiFiSource(_ source: String) -> Bool {
        source == "lan" || source.hasPrefix("lan+") || source.hasPrefix("widget-lan")
    }

    static func ageCaption(
        from date: Date,
        now: Date = Date(),
        language: AppLanguageOption = .simplifiedChinese
    ) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(date)))
        if seconds < 90 {
            return localized(
                language,
                english: "just now",
                simplified: "刚刚",
                traditional: "剛剛",
                spanish: "ahora",
                portuguese: "agora",
                japanese: "今"
            )
        }

        let minutes = seconds / 60
        if minutes < 60 {
            switch language {
            case .english:
                return "\(minutes)m ago"
            case .simplifiedChinese:
                return "\(minutes)分钟前"
            case .traditionalChinese:
                return "\(minutes)分鐘前"
            case .spanish:
                return "hace \(minutes) min"
            case .portuguese:
                return "há \(minutes) min"
            case .japanese:
                return "\(minutes)分前"
            }
        }

        let hours = minutes / 60
        if hours < 24 {
            switch language {
            case .english:
                return "\(hours)h ago"
            case .simplifiedChinese:
                return "\(hours)小时前"
            case .traditionalChinese:
                return "\(hours)小時前"
            case .spanish:
                return "hace \(hours) h"
            case .portuguese:
                return "há \(hours) h"
            case .japanese:
                return "\(hours)時間前"
            }
        }

        return localized(
            language,
            english: "old record",
            simplified: "旧账",
            traditional: "舊帳",
            spanish: "cuenta vieja",
            portuguese: "conta velha",
            japanese: "古い記録"
        )
    }

    private static func cacheLabel(_ language: AppLanguageOption) -> String {
        localized(
            language,
            english: "Cache",
            simplified: "缓存",
            traditional: "快取",
            spanish: "Caché",
            portuguese: "Cache",
            japanese: "キャッシュ"
        )
    }

    private static func localized(
        _ language: AppLanguageOption,
        english: String,
        simplified: String,
        traditional: String,
        spanish: String,
        portuguese: String,
        japanese: String
    ) -> String {
        switch language {
        case .english:
            return english
        case .simplifiedChinese:
            return simplified
        case .traditionalChinese:
            return traditional
        case .spanish:
            return spanish
        case .portuguese:
            return portuguese
        case .japanese:
            return japanese
        }
    }
}
