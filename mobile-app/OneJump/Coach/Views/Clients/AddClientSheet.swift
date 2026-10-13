import SwiftUI

/// Invite a new client: name, email and package. Assist drafts the welcome.
struct AddClientSheet: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var email = ""
    @State private var package: CoachStore.InvitePackage = .online
    @State private var showError = false
    @FocusState private var focused: Field?

    private enum Field { case name, email }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    field(CT.fullName(lang)) {
                        TextField("Jordan Smith", text: $name)
                            .textContentType(.name)
                            .focused($focused, equals: .name)
                            .submitLabel(.next)
                            .onSubmit { focused = .email }
                    }
                    field(CT.email(lang)) {
                        TextField("jordan@email.com", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focused, equals: .email)
                            .submitLabel(.send)
                            .onSubmit(sendInvite)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text(CT.package(lang)).font(OJFont.subStrong).foregroundStyle(Palette.muted)
                        FlowChips(
                            options: CoachStore.InvitePackage.allCases.map { ($0, label(for: $0)) },
                            selection: $package
                        )
                    }
                    AssistCard(label: CT.assistDraft(lang), padding: 12) {
                        DraftText(CT.sheetAssist(lang))
                    }
                    if showError {
                        Text(CT.sheetError(lang))
                            .font(OJFont.sub)
                            .foregroundStyle(Palette.crit)
                    }
                    Button(action: sendInvite) {
                        Label(CT.sendInvite(lang), systemImage: "paperplane.fill")
                    }
                    .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
                }
                .padding(20)
            }
            .background(Palette.bg.ignoresSafeArea())
            .navigationTitle(CT.addClient(lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(SharedText.close(lang)) { dismiss() }
                }
            }
            .onAppear { focused = .name }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(OJFont.subStrong).foregroundStyle(Palette.muted)
            content()
                .font(.archivo(16))
                .padding(.horizontal, 14)
                .frame(height: 48)
                .background(Palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
        }
    }

    private func label(for package: CoachStore.InvitePackage) -> String {
        switch package {
        case .online: return CT.pkgOnline(lang)
        case .hybrid: return CT.pkgHybrid(lang)
        case .inPerson: return CT.pkgInPerson(lang)
        }
    }

    private func sendInvite() {
        if store.invite(name: name, email: email, package: package) {
            dismiss()
        } else {
            withAnimation(.snappy) { showError = true }
        }
    }
}

/// Chips that wrap onto new lines; one can be selected.
struct FlowChips<Value: Hashable>: View {
    let options: [(Value, String)]
    @Binding var selection: Value

    var body: some View {
        WrapLayout(spacing: 8) {
            ForEach(Array(options.enumerated()), id: \.offset) { pair in
                Chip(label: pair.element.1, isOn: selection == pair.element.0) {
                    withAnimation(.snappy) { selection = pair.element.0 }
                }
            }
        }
    }
}

/// Lays children out left to right, wrapping to a new line when full.
struct WrapLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineHeight: CGFloat = 0
        var widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > maxWidth {
                x = 0
                y += lineHeight + spacing
                lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var lineHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += lineHeight + spacing
                lineHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
