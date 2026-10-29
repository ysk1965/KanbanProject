import SwiftUI
import WidgetKit

/// 「이번 주 갈피 퀘스트」 — 말씀에 꽂기 +20 → 적용 남기기 +3 → 삶에 꽂기 +10 → 완주 +20
struct QuestWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BridgeQuest", provider: SnapshotProvider()) { entry in
            QuestView(entry: entry)
        }
        .configurationDisplayName("갈피 퀘스트")
        .description("이번 주 말씀을 삶까지, 세 걸음과 달란트를 봐요.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular])
    }
}

/// 위젯이 그릴 퀘스트 상태 (주가 바뀌었으면 빈 퀘스트)
struct QuestState {
    var steps: [Bool]
    var earned: Int
    var total: Int
    var sermon: WSermon?
    var target: WTarget?
    var locked: Bool
    var unlockAt: Double
    var noteDate: String?
    var applyAt: Double?
    var doneAt: Double?
    var streak: Int?
    var bonus: WBonus?

    var cur: Int? { steps.firstIndex(of: false) }
    var complete: Bool { steps.allSatisfy { $0 } }
    var count: Int { steps.filter { $0 }.count }

    init(_ snap: WSnapshot, now: Date) {
        let q = snap.quest
        let fresh = q.weekStart != WDate.monday(now)
        steps = fresh ? [false, false, false] : [q.note, q.apply, q.done]
        earned = fresh ? 0 : q.earned
        total = q.total
        sermon = fresh ? nil : q.sermon
        target = q.target
        unlockAt = q.target?.unlockAt ?? 0
        locked = unlockAt > now.timeIntervalSince1970 * 1000
        noteDate = fresh ? nil : q.noteDate
        applyAt = fresh ? nil : q.applyAt
        doneAt = fresh ? nil : q.doneAt
        streak = q.streakWeeks
        bonus = fresh ? nil : q.bonus
    }
}

struct QuestView: View {
    let entry: BridgeEntry
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let pal = Palette(entry.snap?.ink, scheme)
        Group {
            if let snap = entry.snap {
                let st = QuestState(snap, now: entry.date)
                switch family {
                case .accessoryCircular: QuestCircular(st: st)
                case .systemMedium: QuestMedium(st: st, pal: pal)
                case .systemLarge: QuestLarge(st: st, pal: pal)
                default: QuestSmall(st: st, pal: pal)
                }
            } else if family == .accessoryCircular {
                QuestCircular(st: nil)
            } else {
                EmptyHint(pal: pal, title: "갈피 퀘스트")
            }
        }
        .widgetURL(WLink.challenge)
        .widgetBackground(family == .accessoryCircular ? .clear : questBg(pal))
    }

    private func questBg(_ pal: Palette) -> Color {
        guard let snap = entry.snap, family == .systemSmall, QuestState(snap, now: entry.date).complete else {
            return pal.surface
        }
        return pal.g2
    }
}

// MARK: - 조각

private let stepNames = ["말씀", "적용", "삶"]

struct Stamp: View {
    enum Kind { case done, now, next, locked }
    let kind: Kind
    let label: String
    let pal: Palette
    var size: CGFloat = 34
    var tilt: Double = 0

    var body: some View {
        ZStack {
            switch kind {
            case .done:
                Circle().fill(pal.g2)
                Image(systemName: "checkmark").font(.system(size: size * 0.42, weight: .heavy)).foregroundStyle(pal.dark ? pal.onInk : pal.t2)
            case .now:
                Circle().strokeBorder(pal.t2, style: StrokeStyle(lineWidth: 2, dash: [4, 3]))
                Text(label).font(WFont.ui(12, .bold)).foregroundStyle(pal.t2)
            case .next:
                Circle().fill(pal.surface2)
                Text(label).font(WFont.ui(12, .bold)).foregroundStyle(pal.muted)
            case .locked:
                Circle().fill(pal.surface2)
                Image(systemName: "lock.fill").font(.system(size: size * 0.36, weight: .bold)).foregroundStyle(pal.muted)
            }
        }
        .frame(width: size, height: size)
        .rotationEffect(.degrees(kind == .done ? tilt : 0))
        .widgetAccentable(kind != .next)
        .accessibilityLabel("\(label) \(kind == .done ? "완료" : kind == .locked ? "잠김" : "남음")")
    }
}

func stampKind(_ st: QuestState, _ i: Int) -> Stamp.Kind {
    if st.steps[i] { return .done }
    if st.cur == i { return i == 2 && st.locked && st.target != nil ? .locked : .now }
    return .next
}

struct EarnLabel: View {
    let st: QuestState
    let pal: Palette
    var suffix = ""
    var body: some View {
        HStack(spacing: 3) {
            Coin(size: 13)
            Text("\(st.earned)/\(st.total)\(suffix)").font(WFont.ui(12, .bold)).foregroundStyle(pal.muted)
        }
    }
}

/// 지금 걸음 한 줄 (제목, 부제)
func questLine(_ st: QuestState) -> (String, String) {
    switch st.cur {
    case 0: return ("이번 주 설교를 꽂아요", "새 설교 기록 +20")
    case 1: return ("적용을 하나 남겨요", "노트에 적용 +3")
    case 2:
        if st.target == nil { return ("남긴 적용을 살아 내요", "실천 +10 · 완주 +20") }
        if st.locked { return ("\(WDate.clock(st.unlockAt))부터", "살아 낸 뒤 체크해요") }
        return ("삶에 꽂기만 남았어요", "완주하면 +30")
    default: return ("완주", "+\(st.total) 달란트")
    }
}

// MARK: - 작은

struct QuestSmall: View {
    let st: QuestState
    let pal: Palette

    var body: some View {
        if st.complete {
            VStack(alignment: .leading, spacing: 0) {
                Text("갈피 퀘스트").font(WFont.ui(12, .bold)).foregroundStyle(pal.onInk)
                Spacer(minLength: 4)
                HStack(spacing: 8) {
                    Text("완주").font(WFont.num(20)).foregroundStyle(pal.dark ? pal.onInk : pal.t2)
                        .frame(width: 64, height: 64)
                        .background(Circle().fill(pal.surface.opacity(0.7)))
                        .overlay(Circle().strokeBorder(pal.dark ? pal.onInk : pal.t2, lineWidth: 3))
                        .rotationEffect(.degrees(-12))
                    Galpi(fill: pal.surface, mood: .happy, size: 40)
                }
                Spacer(minLength: 4)
                Text("+\(st.total) 달란트").font(WFont.ui(14, .bold)).foregroundStyle(pal.onInk)
                if let s = st.streak, s > 0 {
                    Text("연속 \(s)주").font(WFont.ui(12)).foregroundStyle(pal.onInk)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            let line = questLine(st)
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("갈피 퀘스트").font(WFont.ui(12, .bold)).foregroundStyle(pal.t2)
                    Spacer(minLength: 2)
                    EarnLabel(st: st, pal: pal)
                }
                Spacer(minLength: 6)
                HStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { i in
                        Stamp(kind: stampKind(st, i), label: stepNames[i], pal: pal, tilt: i == 0 ? -8 : 6)
                    }
                }
                Spacer(minLength: 6)
                Text(line.0).font(WFont.ui(14, .bold)).foregroundStyle(pal.fg).lineLimit(1).minimumScaleFactor(0.8)
                Text(line.1).font(WFont.ui(12)).foregroundStyle(pal.muted).lineLimit(1).padding(.top, 2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

// MARK: - 중간

struct QuestMedium: View {
    let st: QuestState
    let pal: Palette

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                Text("갈피 퀘스트").font(WFont.ui(12, .bold)).foregroundStyle(pal.t2)
                Text("\(st.earned) / \(st.total) 달란트").font(WFont.ui(12)).foregroundStyle(pal.muted).padding(.top, 2)
                Spacer(minLength: 8)
                HStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { i in
                        VStack(spacing: 3) {
                            Stamp(kind: stampKind(st, i), label: "", pal: pal, size: 32)
                            Text(stepNames[i]).font(WFont.ui(12, st.cur == i ? .bold : .regular))
                                .foregroundStyle(st.cur == i ? pal.t2 : pal.muted)
                        }
                    }
                }
            }
            .frame(width: 118, alignment: .leading)
            .frame(maxHeight: .infinity, alignment: .topLeading)

            QuestNowCard(st: st, pal: pal)
        }
    }
}

/// 지금 걸음 카드 — 삶에 꽂기면 위젯 안 버튼으로 바로 체크
struct QuestNowCard: View {
    let st: QuestState
    let pal: Palette

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if st.complete {
                Text("이번 주 완주").font(WFont.ui(12)).foregroundStyle(pal.muted)
                Text("+\(st.total) 달란트").font(WFont.num(22)).foregroundStyle(pal.t2)
                if let s = st.streak, s > 0 {
                    Text("연속 \(s)주 기록").font(WFont.ui(12, .medium)).foregroundStyle(pal.fg)
                }
            } else if st.cur == 2, let tg = st.target {
                if let s = st.sermon {
                    Text("\(WDate.short(s.date)) · \(s.title)").font(WFont.ui(12)).foregroundStyle(pal.muted).lineLimit(1)
                }
                Text("“\(tg.text)”").font(WFont.verse(15, bold: true)).foregroundStyle(pal.fg).lineLimit(2)
                Spacer(minLength: 0)
                if st.locked {
                    PillLabel(text: "\(WDate.clock(st.unlockAt))부터 체크", icon: "lock.fill", fill: pal.line, ink: pal.muted)
                        .frame(maxWidth: .infinity)
                } else {
                    Button(intent: LiveApplyIntent(noteId: tg.noteId, thoughtId: tg.thoughtId)) {
                        PillLabel(text: "살아 냈어요 +10", icon: "checkmark", fill: pal.t2, ink: pal.dark ? pal.onInk : .white)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                }
            } else if st.cur == 1 {
                Text(st.sermon.map { "\(WDate.short($0.date)) · \($0.title)" } ?? "이번 주 노트").font(WFont.ui(12)).foregroundStyle(pal.muted).lineLimit(1)
                Text("노트에 「적용」을\n10자 이상 남겨요").font(WFont.ui(15, .bold)).foregroundStyle(pal.fg)
                Spacer(minLength: 0)
                Link(destination: st.sermon.map { WLink.note($0.id) } ?? WLink.home) {
                    PillLabel(text: "적용 남기기 +3", fill: pal.t2, ink: pal.dark ? pal.onInk : .white).frame(maxWidth: .infinity)
                }
            } else {
                HStack(alignment: .center, spacing: 10) {
                    Galpi(fill: pal.g2, mood: .sleep, size: 40)
                    Text("이번 주 설교를\n아직 안 꽂았어요").font(WFont.ui(15, .bold)).foregroundStyle(pal.fg)
                }
                Spacer(minLength: 0)
                Link(destination: WLink.challenge) {
                    PillLabel(text: "새 설교 기록 +20", fill: pal.t2, ink: pal.dark ? pal.onInk : .white).frame(maxWidth: .infinity)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(pal.surface2))
    }
}

// MARK: - 큰

struct QuestLarge: View {
    let st: QuestState
    let pal: Palette

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("이번 주 갈피 퀘스트").font(WFont.ui(14, .bold)).foregroundStyle(pal.t2)
                Spacer()
                EarnLabel(st: st, pal: pal, suffix: st.streak.map { $0 > 0 ? " · 연속 \($0)주" : "" } ?? "")
            }

            if let s = st.sermon {
                Link(destination: WLink.note(s.id)) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(WDate.short(s.date)).font(WFont.ui(12)).foregroundStyle(pal.onInk)
                        Text(s.title).font(WFont.ui(16, .bold)).foregroundStyle(pal.onInk).lineLimit(1)
                        if let r = s.ref {
                            Text(r).font(WFont.ui(12, .bold)).foregroundStyle(pal.dark ? pal.onInk : pal.t1)
                                .padding(.horizontal, 9).padding(.vertical, 2)
                                .background(Capsule().fill(pal.surface))
                                .rotationEffect(.degrees(-2)).padding(.top, 4)
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        ZStack(alignment: .topTrailing) {
                            RoundedRectangle(cornerRadius: 16, style: .continuous).fill(pal.g1)
                            Halftone(color: pal.t1.opacity(0.22)).frame(width: 70, height: 70).clipShape(Circle()).offset(x: 14, y: -14)
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    )
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                stepRow(0, "말씀에 꽂기", st.noteDate.map { "\(WDate.short($0)) · +20" } ?? "+20")
                stepRow(1, "적용 남기기", st.applyAt.map { "\(WDate.short(WDate.ymd(Date(timeIntervalSince1970: $0 / 1000)))) · +3" } ?? "+3")
                stepRow(2, "삶에 꽂기", st.doneAt.map { "\(WDate.short(WDate.ymd(Date(timeIntervalSince1970: $0 / 1000)))) · +10" } ?? "+10 · 완주 +20")
            }

            if !st.complete, st.cur == 2, let tg = st.target {
                HStack(spacing: 10) {
                    Text("“\(tg.text)”").font(WFont.verse(14, bold: true)).foregroundStyle(pal.fg).lineLimit(2)
                    Spacer(minLength: 4)
                    if st.locked {
                        PillLabel(text: WDate.clock(st.unlockAt), icon: "lock.fill", fill: pal.line, ink: pal.muted)
                    } else {
                        Button(intent: LiveApplyIntent(noteId: tg.noteId, thoughtId: tg.thoughtId)) {
                            PillLabel(text: "살아 냈어요", fill: pal.t2, ink: pal.dark ? pal.onInk : .white)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(pal.surface2))
            } else if st.cur == 0 {
                Link(destination: WLink.challenge) {
                    PillLabel(text: "새 설교 기록 +20", fill: pal.t2, ink: pal.dark ? pal.onInk : .white).frame(maxWidth: .infinity)
                }
            }

            Spacer(minLength: 0)
            if let b = st.bonus {
                HStack(spacing: 8) {
                    chip("보너스 · 노트 \(b.notes)/\(b.notesMax)")
                    chip("실천 \(b.done)/\(b.doneMax)")
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func stepRow(_ i: Int, _ name: String, _ meta: String) -> some View {
        let k = stampKind(st, i)
        return HStack(spacing: 10) {
            Stamp(kind: k, label: "", pal: pal, size: 26)
            Text(name).font(WFont.ui(14, k == .now || k == .locked ? .bold : .medium))
                .foregroundStyle(k == .now ? pal.t2 : pal.fg)
            Spacer()
            Text(meta).font(WFont.ui(12, k == .now ? .bold : .regular)).foregroundStyle(k == .now ? pal.t2 : pal.muted)
        }
    }

    private func chip(_ s: String) -> some View {
        Text(s).font(WFont.ui(12, .bold)).foregroundStyle(pal.t1)
            .padding(.horizontal, 10).padding(.vertical, 3)
            .background(Capsule().fill(pal.g1.opacity(0.3)))
    }
}

// MARK: - 잠금 화면 (원형)

struct QuestCircular: View {
    let st: QuestState?

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .trim(from: CGFloat(i) / 3 + 0.02, to: CGFloat(i + 1) / 3 - 0.02)
                    .stroke(style: StrokeStyle(lineWidth: 5, lineCap: .butt))
                    .rotationEffect(.degrees(-90))
                    .opacity(st?.steps[i] == true ? 1 : 0.3)
                    .padding(3)
            }
            VStack(spacing: 0) {
                Ribbon().frame(width: 10, height: 13)
                Text(st.map { "\($0.count)/3" } ?? "–").font(WFont.num(16))
            }
        }
        .widgetAccentable()
        .accessibilityLabel(st.map { "갈피 퀘스트 3걸음 중 \($0.count)걸음" } ?? "갈피 퀘스트")
    }
}
