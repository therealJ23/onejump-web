import SwiftUI

/// The language list used in both apps' settings.
struct LanguageList: View {
    let current: AppLanguage
    /// Note under a fully supported language ("Full app and Assist’s voice").
    let fullNote: String
    /// Note under a language that only translates messages for now.
    let partialNote: String
    let onPick: (AppLanguage) -> Void

    var body: some View {
        DividedRows(AppLanguage.allCases) { language in
            Button {
                onPick(language)
            } label: {
                row(language)
            }
            .buttonStyle(.row)
            .accessibilityAddTraits(language == current ? .isSelected : [])
        }
    }

    private func row(_ language: AppLanguage) -> some View {
        let isOn = language == current
        return HStack(spacing: 12) {
            Text(language.code)
                .font(.archivo(12, .heavy))
                .tracking(0.5)
                .foregroundStyle(isOn ? Palette.deep : Palette.ink)
                .frame(width: 40, height: 40)
                .background(isOn ? Palette.volt : Palette.surface2, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            TitleSub(language.nativeName, sub: language.isFullySupported ? fullNote : partialNote)
            if isOn {
                Image(systemName: "checkmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Palette.good)
            }
        }
        .rowPadding()
    }
}

/// Light / Dark / System picker.
struct AppearancePicker: View {
    @Binding var appearance: Appearance
    @Environment(\.lang) private var lang

    var body: some View {
        SegmentedBar(
            options: [
                SegmentOption(value: Appearance.light, label: SharedText.light(lang), systemImage: "sun.max"),
                SegmentOption(value: Appearance.dark, label: SharedText.dark(lang), systemImage: "moon"),
                SegmentOption(value: Appearance.system, label: SharedText.system(lang), systemImage: "iphone")
            ],
            selection: $appearance
        )
    }
}
