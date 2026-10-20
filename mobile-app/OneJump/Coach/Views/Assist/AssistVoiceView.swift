import SwiftUI

/// Voice mode: the glowing Assist logo with a see-through chat. The microphone is always open;
/// talk any time, and talk over Assist to stop it.
struct AssistVoiceView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        ZStack {
            Palette.bg.ignoresSafeArea()
            AmbientGlow(level: store.voice.inputLevel, speaking: store.voice.isSpeaking)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                header
                chat
                    .frame(maxHeight: .infinity)
                GlowingAssistLogo(level: store.voice.inputLevel, speaking: store.voice.isSpeaking, thinking: store.thinking)
                    .frame(height: 210)
                    .contentShape(Circle())
                    .onTapGesture { store.tapOrb() }
                    .accessibilityLabel(store.voice.isSpeaking ? AVT.stopTalking(lang) : AVT.voiceMode(lang))
                status
                    .padding(.horizontal, 24)
                    .frame(minHeight: 64, alignment: .top)
                controls
                    .padding(.bottom, 12)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private var header: some View {
        HStack(spacing: 10) {
            AssistMark(size: 20)
            Text("Assist").font(OJFont.title).foregroundStyle(Palette.ink)
            Pill(AVT.voiceMode(lang), tone: .ai)
            Spacer()
            if !store.assistMessages.isEmpty {
                LinkButton(CT.newChat(lang)) { store.newChat() }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    /// The conversation, see-through and fading out at the top.
    private var chat: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 14) {
                    Color.clear.frame(height: 40)
                    if store.assistMessages.isEmpty {
                        Text(AVT.voiceHint(lang))
                            .font(.archivo(17, .medium))
                            .foregroundStyle(Palette.muted)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                        SubText(AVT.keepGoing(lang))
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                    }
                    ForEach(Array(store.assistMessages.enumerated()), id: \.element.id) { pair in
                        VoiceChatLine(message: pair.element, index: pair.offset)
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, 20)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            .mask(
                LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.22), .init(color: .black, location: 1)],
                               startPoint: .top, endPoint: .bottom)
            )
            .onChange(of: store.assistMessages.count) { _, _ in
                withAnimation(.snappy) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onAppear { proxy.scrollTo("bottom", anchor: .bottom) }
        }
    }

    private var status: some View {
        VStack(spacing: 6) {
            if store.thinking {
                Text(AVT.thinking(lang)).font(.archivo(15, .semibold)).foregroundStyle(Palette.assistInk)
            } else if store.voice.isSpeaking {
                Text(AVT.speaking(lang)).font(.archivo(15, .semibold)).foregroundStyle(Palette.assistInk)
            } else if !store.voice.heard.isEmpty {
                Text("“\(store.voice.heard)”")
                    .font(.archivo(17, .medium))
                    .foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
            } else {
                Text(AVT.listening(lang)).font(.archivo(15, .semibold)).foregroundStyle(Palette.assistInk)
            }
            if !store.hint.isEmpty {
                Text(store.hint).font(.archivo(13, .semibold)).foregroundStyle(Palette.warn)
            }
        }
        .animation(.snappy, value: store.voice.heard)
        .contentTransition(.opacity)
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Button {
                store.endVoiceMode()
            } label: {
                Label(AVT.typeInstead(lang), systemImage: "keyboard")
            }
            .buttonStyle(.oj(.ghost, size: .small))
            if store.voice.isSpeaking {
                Button {
                    store.voice.stopSpeaking()
                } label: {
                    Label(AVT.stopTalking(lang), systemImage: "stop.fill")
                }
                .buttonStyle(.oj(.ghost, size: .small))
                .transition(.opacity)
            }
            Button {
                store.endVoiceMode()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Palette.crit, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(AVT.endVoice(lang))
        }
        .animation(.snappy, value: store.voice.isSpeaking)
    }
}

/// One line of the see-through chat.
private struct VoiceChatLine: View {
    let message: AssistMessage
    let index: Int
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        if message.fromMe {
            Text(message.text)
                .font(.archivo(15))
                .foregroundStyle(Palette.muted)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: .infinity, alignment: .trailing)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                if !message.text.isEmpty {
                    Text(message.text)
                        .font(.archivo(18, .medium))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let quote = message.quote {
                    Text(quote)
                        .font(.archivo(15))
                        .foregroundStyle(Palette.ink.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.leading, 12)
                        .overlay(alignment: .leading) { Rectangle().fill(Palette.assistInk).frame(width: 2) }
                }
                if let card = message.card {
                    if card.isOpen {
                        cardView(card)
                    } else if card.done {
                        DoneChip(card.doneText)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func cardView(_ card: ActionCard) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(card.label).font(OJFont.title).foregroundStyle(Palette.ink)
            ForEach(Array(card.details.prefix(6).enumerated()), id: \.offset) { pair in
                Text(pair.element)
                    .font(.archivo(13))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            SubText(card.voiceOK ? CL.sayYesOrTap(lang) : CL.tapToConfirm(lang))
            HStack(spacing: 8) {
                Button(card.button) { store.confirmCard(index) }
                    .buttonStyle(.oj(card.destructive ? .danger : .primary, size: .small, fullWidth: true))
                Button(CT.notNow(lang)) { store.dismissCard(index) }
                    .buttonStyle(.oj(.ghost, size: .small))
            }
        }
        .padding(12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Palette.assistLine, lineWidth: 1))
    }
}

/// The Assist logo, glowing: it breathes while listening, swells with the coach's voice, ripples
/// while Assist speaks and shimmers while it thinks.
struct GlowingAssistLogo: View {
    var level: Float
    var speaking: Bool
    var thinking: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30)) { timeline in
            LogoFrame(t: timeline.date.timeIntervalSinceReferenceDate, voice: CGFloat(level), speaking: speaking, thinking: thinking)
        }
        .accessibilityHidden(true)
    }
}

private struct LogoFrame: View {
    let t: Double
    let voice: CGFloat
    let speaking: Bool
    let thinking: Bool

    private var scale: CGFloat {
        let breathe: CGFloat = 1 + 0.035 * CGFloat(sin(t * 2.2))
        let talk: CGFloat = speaking ? 0.05 * CGFloat(abs(sin(t * 7))) : 0
        let swell: CGFloat = 1 + voice * 0.18 + talk
        return breathe * swell
    }

    var body: some View {
        ZStack {
            ForEach(0..<3, id: \.self) { i in
                Ripple(t: t, index: i, speaking: speaking)
            }
            Circle()
                .fill(haloGradient)
                .frame(width: 240, height: 240)
                .blur(radius: 12)
            Circle()
                .fill(orbGradient)
                .frame(width: 118, height: 118)
                .shadow(color: Palette.volt.opacity(0.75), radius: 30 + voice * 30)
                .overlay { if thinking { Spinner(t: t) } }
            AssistMark(size: 50, color: Palette.deep)
        }
        .scaleEffect(scale)
    }

    private var haloGradient: RadialGradient {
        let strength: Double = 0.55 + Double(voice) * 0.3
        return RadialGradient(colors: [Palette.volt.opacity(strength), Palette.volt.opacity(0)], center: .center, startRadius: 10, endRadius: 120)
    }

    private var orbGradient: RadialGradient {
        RadialGradient(colors: [Color(hex: 0xF6FFC9), Palette.volt, Color(hex: 0x86AE0C)], center: UnitPoint(x: 0.34, y: 0.28), startRadius: 0, endRadius: 90)
    }
}

private struct Ripple: View {
    let t: Double
    let index: Int
    let speaking: Bool

    var body: some View {
        let speed: Double = speaking ? 0.9 : 0.5
        let phase: Double = (t * speed + Double(index) / 3).truncatingRemainder(dividingBy: 1)
        let size: CGFloat = 120 + 110 * CGFloat(phase)
        return Circle()
            .stroke(Palette.volt.opacity(0.45 * (1 - phase)), lineWidth: 2)
            .frame(width: size, height: size)
    }
}

private struct Spinner: View {
    let t: Double

    var body: some View {
        Circle()
            .trim(from: 0, to: 0.28)
            .stroke(Color.white.opacity(0.85), style: StrokeStyle(lineWidth: 3, lineCap: .round))
            .rotationEffect(.radians(t * 4))
            .frame(width: 132, height: 132)
    }
}

/// A soft volt light behind the voice screen.
private struct AmbientGlow: View {
    var level: Float
    var speaking: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 20)) { timeline in
            AmbientFrame(t: timeline.date.timeIntervalSinceReferenceDate, level: Double(level), speaking: speaking)
        }
        .allowsHitTesting(false)
    }
}

private struct AmbientFrame: View {
    let t: Double
    let level: Double
    let speaking: Bool

    var body: some View {
        let wave: Double = speaking ? 0.05 * sin(t * 4) : 0
        let strength: Double = 0.16 + level * 0.2 + wave
        return RadialGradient(colors: [Palette.volt.opacity(strength), Color.clear], center: UnitPoint(x: 0.5, y: 0.72), startRadius: 20, endRadius: 460)
    }
}

/// The screen's edges and corners glow green while Assist is listening on another screen.
struct VoiceEdgeGlow: View {
    var level: Float
    var speaking: Bool
    var thinking: Bool

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation(minimumInterval: 1 / 30)) { timeline in
                EdgeFrame(t: timeline.date.timeIntervalSinceReferenceDate, size: geo.size, level: Double(level), speaking: speaking, thinking: thinking)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct EdgeFrame: View {
    let t: Double
    let size: CGSize
    let level: Double
    let speaking: Bool
    let thinking: Bool

    private var pulse: Double {
        let speed: Double = thinking ? 5 : 2.2
        let talk: Double = speaking ? 0.12 * abs(sin(t * 7)) : 0
        return min(1, 0.55 + 0.2 * sin(t * speed) + level * 0.45 + talk)
    }

    private var glow: LinearGradient {
        LinearGradient(colors: [Color(hex: 0x63C68C), Palette.volt, Color(hex: 0x2C7A4B), Palette.volt], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 50, style: .continuous)
                .strokeBorder(glow, lineWidth: 5)
                .blur(radius: 6)
            RoundedRectangle(cornerRadius: 50, style: .continuous)
                .strokeBorder(glow, lineWidth: 14)
                .blur(radius: 22)
                .opacity(0.8)
            CornerGlow().position(x: 0, y: 0)
            CornerGlow().position(x: size.width, y: 0)
            CornerGlow().position(x: 0, y: size.height)
            CornerGlow().position(x: size.width, y: size.height)
        }
        .opacity(pulse)
    }
}

private struct CornerGlow: View {
    var body: some View {
        Circle()
            .fill(RadialGradient(colors: [Color(hex: 0x7BE495).opacity(0.75), Palette.volt.opacity(0.25), Color.clear], center: .center, startRadius: 0, endRadius: 110))
            .frame(width: 220, height: 220)
    }
}

/// A small pill above the tab bar while Assist listens on another screen: tap to go back, × to end.
struct VoiceStatusPill: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    private var pillText: String {
        if store.thinking { return AVT.assistThinking(lang) }
        if store.voice.isSpeaking { return AVT.assistSpeaking(lang) }
        let heard = store.voice.heard
        return heard.isEmpty ? AVT.assistListening(lang) : "“" + heard + "”"
    }

    var body: some View {
        HStack(spacing: 10) {
            Button {
                store.go(.assist)
            } label: {
                HStack(spacing: 8) {
                    if store.voice.isSpeaking {
                        VoiceWave(color: Palette.deep, bars: 4)
                    } else {
                        TimelineView(.animation(minimumInterval: 1 / 20)) { timeline in
                            Circle()
                                .fill(Palette.deep)
                                .frame(width: 9, height: 9)
                                .scaleEffect(1 + 0.25 * sin(timeline.date.timeIntervalSinceReferenceDate * 5))
                        }
                        .frame(width: 12, height: 12)
                    }
                    Text(pillText)
                        .font(.archivo(13, .semibold))
                        .foregroundStyle(Palette.deep)
                        .lineLimit(1)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(AVT.backToAssist(lang))
            Button {
                store.endVoiceMode()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Palette.deep)
                    .frame(width: 24, height: 24)
                    .background(Color.white.opacity(0.5), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(AVT.endVoice(lang))
        }
        .padding(.leading, 14)
        .padding(.trailing, 6)
        .frame(height: 38)
        .frame(maxWidth: 300)
        .background(Palette.volt, in: Capsule())
        .shadow(color: Palette.volt.opacity(0.6), radius: 14, x: 0, y: 4)
    }
}
