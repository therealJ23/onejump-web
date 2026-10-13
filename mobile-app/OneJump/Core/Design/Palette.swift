import SwiftUI
import UIKit

// Brand colors and the light/dark tokens from the prototype.
// Every color here adapts to light and dark mode on its own.

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: alpha
        )
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(uiColor: UIColor(hex: hex, alpha: CGFloat(alpha)))
    }

    /// A color that switches between two values for light and dark mode.
    static func adaptive(light: UIColor, dark: UIColor) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? dark : light
        })
    }

    static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        adaptive(light: UIColor(hex: light), dark: UIColor(hex: dark))
    }
}

enum Palette {
    // Brand
    static let deep = Color(hex: 0x12281F)
    static let green = Color(hex: 0x2F5D4E)
    static let bone = Color(hex: 0xF4F6F1)
    static let stone = Color(hex: 0xC6D2C8)
    /// Volt is for Assist (AI) and highlights only.
    static let volt = Color(hex: 0xD6FF3D)

    // Surfaces
    static let bg = Color.adaptive(0xF1F4EE, 0x0A1611)
    static let surface = Color.adaptive(0xFFFFFF, 0x11221B)
    static let surface2 = Color.adaptive(0xF3F6F0, 0x172B23)
    static let surface3 = Color.adaptive(0xE4EAE0, 0x20382E)
    static let hero = Color.adaptive(0x12281F, 0x15301F)

    // Text and lines
    static let ink = Color.adaptive(0x12281F, 0xE6ECE3)
    static let muted = Color.adaptive(0x56685E, 0xA3B6AA)
    static let line = Color.adaptive(light: UIColor(hex: 0x12281F, alpha: 0.09), dark: UIColor(hex: 0xE6ECE3, alpha: 0.08))
    static let line2 = Color.adaptive(light: UIColor(hex: 0x12281F, alpha: 0.16), dark: UIColor(hex: 0xE6ECE3, alpha: 0.16))

    // Actions
    static let primary = Color.adaptive(0x12281F, 0xD6FF3D)
    static let onPrimary = Color.adaptive(0xF4F6F1, 0x12281F)
    static let link = Color.adaptive(0x2F5D4E, 0xD6FF3D)

    // Assist (AI)
    static let assistInk = Color.adaptive(0x4A6300, 0xD6FF3D)
    static let assistSoft = Color.adaptive(light: UIColor(hex: 0xD6FF3D, alpha: 0.18), dark: UIColor(hex: 0xD6FF3D, alpha: 0.08))
    static let assistLine = Color.adaptive(light: UIColor(hex: 0x7AA000, alpha: 0.36), dark: UIColor(hex: 0xD6FF3D, alpha: 0.26))

    // Status
    static let good = Color.adaptive(0x2C7A4B, 0x63C68C)
    static let goodTint = Color.adaptive(light: UIColor(hex: 0x2C7A4B, alpha: 0.12), dark: UIColor(hex: 0x63C68C, alpha: 0.14))
    static let warn = Color.adaptive(0x93600E, 0xE5AE52)
    static let warnTint = Color.adaptive(light: UIColor(hex: 0xD69628, alpha: 0.17), dark: UIColor(hex: 0xE5AE52, alpha: 0.14))
    static let crit = Color.adaptive(0xB23A26, 0xF2826C)
    static let critTint = Color.adaptive(light: UIColor(hex: 0xB23A26, alpha: 0.10), dark: UIColor(hex: 0xF2826C, alpha: 0.13))
    static let info = Color.adaptive(0x2F5D4E, 0x9DC7B4)
    static let infoTint = Color.adaptive(light: UIColor(hex: 0x2F5D4E, alpha: 0.11), dark: UIColor(hex: 0x9DC7B4, alpha: 0.12))

    // Charts
    static let chart = Color.adaptive(0x2F5D4E, 0xD6FF3D)
    static let chartMuted = Color.adaptive(0x5E8A71, 0x5E8A71)
    static let chartSelected = Color.adaptive(0x12281F, 0xD6FF3D)
    static let progressGreen = Color(hex: 0x9BC412)

    // Shadows
    static let shadow = Color.adaptive(light: UIColor(hex: 0x12281F, alpha: 0.10), dark: UIColor(white: 0, alpha: 0.45))
}

/// Status colors used by pills, dots and badges.
enum Tone: Hashable {
    case crit, warn, good, info, muted, ai

    var foreground: Color {
        switch self {
        case .crit: return Palette.crit
        case .warn: return Palette.warn
        case .good: return Palette.good
        case .info: return Palette.info
        case .muted: return Palette.muted
        case .ai: return Palette.assistInk
        }
    }

    var background: Color {
        switch self {
        case .crit: return Palette.critTint
        case .warn: return Palette.warnTint
        case .good: return Palette.goodTint
        case .info: return Palette.infoTint
        case .muted: return Palette.surface3
        case .ai: return Palette.assistSoft
        }
    }
}
