import SwiftUI
import UIKit

/// Light taps and success buzzes.
enum Haptics {
    static func tick() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}

/// Number formatting that matches the prototype ("$1,972", "2.25").
enum Fmt {
    /// 1972 → "1,972"
    static func grouped(_ value: Int) -> String {
        let digits = String(abs(value))
        var out = ""
        for (i, ch) in digits.reversed().enumerated() {
            if i > 0 && i % 3 == 0 { out.append(",") }
            out.append(ch)
        }
        return (value < 0 ? "-" : "") + String(out.reversed())
    }

    /// 1972 → "$1,972"
    static func money(_ value: Int) -> String { "$" + grouped(value) }

    /// 152.4 → "152.4"
    static func oneDecimal(_ value: Double) -> String { String(format: "%.1f", value) }

    /// 2.25 → "2.25", 2.0 → "2"
    static func trimmed(_ value: Double) -> String {
        let rounded = (value * 100).rounded() / 100
        if rounded == rounded.rounded() { return String(Int(rounded)) }
        return String(format: rounded * 10 == (rounded * 10).rounded() ? "%.1f" : "%.2f", rounded)
    }

    /// 125 seconds → "2:05"
    static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }
}

extension Array {
    /// Safe lookup that returns nil instead of crashing.
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

/// Runs a closure on the main queue after a delay.
func after(_ seconds: Double, _ work: @escaping () -> Void) {
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
}
