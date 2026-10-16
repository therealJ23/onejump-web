import SwiftUI

/// One line in the Assist chat: your question, or Assist's answer with its action card.
struct AssistMessageView: View {
    let message: AssistMessage
    let index: Int
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        if message.fromMe {
            ChatBubble(fromMe: true) { Text(message.text) }
        } else {
            answer
        }
    }

    private var answer: some View {
        VStack(alignment: .leading, spacing: 10) {
            AssistLabel("Assist")
            Text(message.text)
                .font(OJFont.body)
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)

            if !message.points.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(message.points.enumerated()), id: \.offset) { pair in
                        HStack(alignment: .top, spacing: 10) {
                            Circle().fill(Palette.assistInk).frame(width: 6, height: 6).padding(.top, 7)
                            (Text(pair.element.bold + " ").bold() + Text(pair.element.text))
                                .font(OJFont.body)
                                .foregroundStyle(Palette.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }

            if !message.table.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(message.table.enumerated()), id: \.offset) { pair in
                        HStack {
                            Text(pair.element.week).font(.archivo(14, .semibold)).frame(maxWidth: .infinity, alignment: .leading)
                            Text(pair.element.sets).font(.archivo(14)).frame(maxWidth: .infinity, alignment: .leading)
                            Text(pair.element.intensity).font(.archivo(14)).foregroundStyle(Palette.muted).frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 10)
                        .background(pair.offset % 2 == 0 ? Palette.surface : Color.clear)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
            }

            if let quote = message.quote {
                Text(quote)
                    .font(OJFont.body)
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(alignment: .leading) {
                        Rectangle().fill(Palette.assistInk).frame(width: 3).padding(.vertical, 8)
                    }
            }

            if let foot = message.foot {
                SubText(foot)
            }

            if let card = message.card {
                if card.isOpen {
                    actionCard(card)
                } else if card.done {
                    DoneChip(card.doneText)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.assistSoft, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.assistLine, lineWidth: 1))
    }

    /// The action Assist offers. With voice on it asks out loud and waits for "yes".
    private func actionCard(_ card: ActionCard) -> some View {
        let isAsking = store.voiceOn && store.pendingIndex == index
        let canSpeak = store.voiceOn && (card.kind != .proposal || card.voiceOK)
        return VStack(alignment: .leading, spacing: 10) {
            Text(card.label).font(OJFont.title).foregroundStyle(Palette.ink)
            SubText(card.sub)
            ForEach(Array(card.details.enumerated()), id: \.offset) { pair in
                Text(pair.element)
                    .font(.archivo(13))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if canSpeak {
                if isAsking {
                    ListenBar(text: listenText)
                    tapAlternative(prefix: CT.cantTalk(lang), yes: CT.yes(lang), no: CT.no(lang))
                } else {
                    Button {
                        store.voice.stopSpeaking()
                        store.askListen(index, force: true)
                    } label: {
                        Label(CT.answerByVoice(lang), systemImage: "mic.fill")
                    }
                    .buttonStyle(.oj(.volt, size: .small))
                    tapAlternative(prefix: CT.orTap(lang), yes: card.button, no: CT.notNow(lang))
                }
            } else {
                HStack(spacing: 8) {
                    Button(card.button) { store.confirmCard(index) }
                        .buttonStyle(.oj(.primary, size: .small, fullWidth: true))
                    Button(CT.notNow(lang)) { store.dismissCard(index) }
                        .buttonStyle(.oj(.ghost, size: .small))
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
    }

    private var listenText: String {
        if store.listenMode == .confirm {
            return store.voice.heard.isEmpty ? CT.listenYesNo(lang) : "“\(store.voice.heard)”"
        }
        return CT.assistAsking(lang)
    }

    private func tapAlternative(prefix: String, yes: String, no: String) -> some View {
        HStack(spacing: 10) {
            SubText(prefix)
            Button(yes) { store.confirmCard(index) }
                .font(.archivo(13, .bold))
                .foregroundStyle(Palette.link)
                .buttonStyle(.plain)
            Button(no) { store.dismissCard(index) }
                .font(.archivo(13, .bold))
                .foregroundStyle(Palette.muted)
                .buttonStyle(.plain)
        }
    }
}
