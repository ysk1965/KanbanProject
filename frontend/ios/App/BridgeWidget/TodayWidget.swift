import SwiftUI
import WidgetKit

/// 「오늘 할 일」 — 한 주 동안의 오늘 칸 (예배 갈피 = 설교 적용 + 내 카테고리, 못 한 일은 오늘로 넘어온다)
struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BridgeToday", provider: SnapshotProvider()) { entry in
            TodayView(entry: entry)
        }
        .configurationDisplayName("오늘 할 일")
        .description("설교 적용과 내가 적은 할 일을 오늘 칸에서 바로 체크해요.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryInline])
    }
}

struct TodayState {
    let day: String
    let week: String
    /// 안 한 일 먼저 (같은 무리 안에선 앱 순서)
    let tasks: [WTask]
    let cats: [WCat]
    var done: Int { tasks.filter(\.done).count }
    var left: Int { tasks.count - done }

    /// 요약이 오늘을 품지 않으면(앱을 한 주 넘게 안 열었음) nil
    init?(_ snap: WSnapshot, now: Date) {
        day = WDate.ymd(now)
        guard let list = snap.today.days[day] else { return nil }
        week = snap.today.week
        tasks = list.filter { !$0.done } + list.filter(\.done)
        cats = snap.today.cats
    }

    func cat(_ id: String) -> WCat? { cats.first { $0.id == id } }
}

struct TodayView: View {
    let entry: BridgeEntry
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let pal = Palette(entry.snap?.ink, scheme)
        let st = entry.snap.flatMap { TodayState($0, now: entry.date) }
        Group {
            switch family {
            case .accessoryCircular: TodayCircular(st: st)
            case .accessoryInline: TodayInline(st: st)
            default:
                if let st {
                    switch family {
                    case .systemMedium: TodayMedium(st: st, pal: pal, now: entry.date)
                    case .systemLarge: TodayLarge(st: st, pal: pal, now: entry.date)
                    default: TodaySmall(st: st, pal: pal, now: entry.date)
                    }
                } else {
                    EmptyHint(pal: pal, title: "오늘 할 일")
                }
            }
        }
        .widgetURL(WLink.home)
        .widgetBackground(background(pal, st))
    }

    private func background(_ pal: Palette, _ st: TodayState?) -> Color {
        if family == .accessoryCircular || family == .accessoryInline { return .clear }
        if family == .systemSmall, let st, !st.tasks.isEmpty, st.left == 0 { return pal.g3 }
        if family == .systemSmall, let st, st.tasks.isEmpty { return pal.bg }
        return pal.surface
    }
}

// MARK: - 조각

struct CatIcon: View {
    let cat: WCat?
    let pal: Palette
    var size: CGFloat = 12

    var body: some View {
        let color = pal.cat(cat?.color ?? "g1")
        Group {
            if cat?.icon == "ribbon" || cat?.id == "galpi" {
                Ribbon().fill(cat?.id == "galpi" ? pal.g2 : color).frame(width: size * 0.75, height: size)
            } else {
                Image(systemName: symbol(cat?.icon)).font(.system(size: size * 0.9, weight: .bold)).foregroundStyle(color)
            }
        }
        .accessibilityLabel(cat?.name ?? "")
    }

    private func symbol(_ icon: String?) -> String {
        switch icon {
        case "home": return "house"
        case "users": return "person.2"
        case "book": return "book"
        case "briefcase": return "briefcase"
        case "heart": return "heart"
        default: return "tag"
        }
    }
}

/// 체크 동그라미 — iOS 17 위젯 버튼. 누르면 대기열에 적고 바로 체크된 모습으로
struct TaskCheck: View {
    let task: WTask
    let st: TodayState
    let pal: Palette

    var body: some View {
        let color = task.kind == "apply" ? pal.t2 : pal.cat(st.cat(task.cat)?.color ?? "g1")
        Button(intent: ToggleTaskIntent(task: task, done: !task.done, date: st.day, week: st.week)) {
            ZStack {
                if task.done {
                    Circle().fill(task.kind == "apply" ? pal.g2 : color.opacity(pal.dark ? 1 : 0.35))
                    Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(pal.dark ? pal.onInk : (task.kind == "apply" ? pal.t2 : pal.fg))
                } else {
                    Circle().strokeBorder(color, lineWidth: 2)
                }
            }
            .frame(width: 24, height: 24)
            .frame(width: 32, height: 32)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(task.text) \(task.done ? "완료 취소" : "완료")")
    }
}

struct TaskRow: View {
    let task: WTask
    let st: TodayState
    let pal: Palette
    var showCat = true
    var showNote = false

    var body: some View {
        HStack(spacing: 6) {
            TaskCheck(task: task, st: st, pal: pal)
            Text(task.text).font(WFont.ui(14, .medium)).foregroundStyle(task.done ? pal.muted : pal.fg).lineLimit(1)
            Spacer(minLength: 2)
            if let carry = task.carry, !task.done {
                chip(carry == WDate.ymd(Date().addingTimeInterval(-86_400)) ? "어제" : WDate.short(carry))
            } else if task.rep == "daily" {
                Text("매일").font(WFont.ui(12, .bold)).foregroundStyle(pal.t1)
                    .padding(.horizontal, 7).padding(.vertical, 1)
                    .background(Capsule().fill(pal.g1.opacity(pal.dark ? 0.18 : 0.3)))
            } else if showNote, let d = task.noteDate {
                Text("\(WDate.short(d)) 설교").font(WFont.ui(12)).foregroundStyle(pal.muted)
            } else if showCat, task.cat == "galpi" {
                CatIcon(cat: st.cat(task.cat), pal: pal)
            }
        }
        .frame(minHeight: 32)
    }

    private func chip(_ s: String) -> some View {
        Text(s).font(WFont.ui(12, .bold))
            .foregroundStyle(Color(hex: pal.dark ? "#ffd29a" : "#8a4b00"))
            .padding(.horizontal, 7).padding(.vertical, 1)
            .background(Capsule().fill(Color(hex: pal.dark ? "#4a3418" : "#ffe2b8")))
    }
}

struct Ring: View {
    let value: Double
    let pal: Palette
    var body: some View {
        ZStack {
            Circle().stroke(pal.surface2, lineWidth: 7)
            Circle().trim(from: 0, to: max(0.001, min(1, value)))
                .stroke(pal.g1, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
    }
}

// MARK: - 작은

struct TodaySmall: View {
    let st: TodayState
    let pal: Palette
    let now: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if st.tasks.isEmpty {
                Text("오늘 할 일").font(WFont.ui(12, .bold)).foregroundStyle(pal.t1)
                Spacer(minLength: 6)
                Text("오늘은 비어 있어요").font(WFont.ui(14, .bold)).foregroundStyle(pal.fg)
                Spacer(minLength: 6)
                PillLabel(text: "할 일 적기", icon: "plus", fill: pal.t1, ink: pal.dark ? pal.onInk : .white)
            } else if st.left == 0 {
                Text("오늘 할 일").font(WFont.ui(12, .bold)).foregroundStyle(pal.mintInk)
                Spacer(minLength: 4)
                Galpi(fill: pal.surface, mood: .happy, size: 52)
                Spacer(minLength: 4)
                Text("오늘 다 했어요").font(WFont.ui(14, .bold)).foregroundStyle(pal.onInk)
                Text("\(st.tasks.count)개 모두").font(WFont.ui(12)).foregroundStyle(pal.mintInk).padding(.top, 2)
            } else {
                HStack {
                    Text("오늘 할 일").font(WFont.ui(12, .bold)).foregroundStyle(pal.t1)
                    Spacer()
                    Text(WDate.weekday(now)).font(WFont.ui(12)).foregroundStyle(pal.muted)
                }
                Spacer(minLength: 6)
                HStack(spacing: 10) {
                    ZStack {
                        Ring(value: Double(st.done) / Double(max(1, st.tasks.count)), pal: pal)
                        Text("\(st.done)/\(st.tasks.count)").font(WFont.num(16)).foregroundStyle(pal.fg)
                    }
                    .frame(width: 52, height: 52)
                    Text("\(st.left)개\n남았어요").font(WFont.ui(12)).foregroundStyle(pal.muted)
                }
                Spacer(minLength: 6)
                if let next = st.tasks.first {
                    HStack(spacing: 6) {
                        CatIcon(cat: st.cat(next.cat), pal: pal, size: 12)
                        Text(next.text).font(WFont.ui(13, .medium)).foregroundStyle(pal.fg).lineLimit(1)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - 중간

struct TodayMedium: View {
    let st: TodayState
    let pal: Palette
    let now: Date

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                Text("오늘 할 일").font(WFont.ui(12, .bold)).foregroundStyle(pal.t1)
                Text(WDate.label(now)).font(WFont.ui(12)).foregroundStyle(pal.muted).padding(.top, 2)
                Spacer(minLength: 4)
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text("\(st.done)").font(WFont.num(38)).foregroundStyle(pal.fg)
                    Text("/\(st.tasks.count)").font(WFont.num(19)).foregroundStyle(pal.muted)
                }
                Spacer(minLength: 4)
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(pal.surface2)
                        Capsule().fill(pal.g1).frame(width: g.size.width * Double(st.done) / Double(max(1, st.tasks.count)))
                    }
                }
                .frame(height: 6)
            }
            .frame(width: 88)
            .frame(maxHeight: .infinity, alignment: .topLeading)

            VStack(alignment: .leading, spacing: 0) {
                if st.tasks.isEmpty {
                    Spacer()
                    Text("오늘은 비어 있어요").font(WFont.ui(14, .bold)).foregroundStyle(pal.fg)
                    Text("눌러서 할 일을 적어요").font(WFont.ui(12)).foregroundStyle(pal.muted).padding(.top, 2)
                    Spacer()
                } else if st.left == 0 {
                    Spacer()
                    HStack(spacing: 10) {
                        Galpi(fill: pal.g2, mood: .happy, size: 38)
                        Text("오늘 다 했어요").font(WFont.ui(15, .bold)).foregroundStyle(pal.fg)
                    }
                    Spacer()
                } else {
                    Spacer(minLength: 0)
                    ForEach(st.tasks.prefix(3)) { t in TaskRow(task: t, st: st, pal: pal) }
                    if st.left > 3 {
                        Text("외 \(st.left - 3)개").font(WFont.ui(12)).foregroundStyle(pal.muted).padding(.leading, 38)
                    }
                    Spacer(minLength: 0)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - 큰

struct TodayLarge: View {
    let st: TodayState
    let pal: Palette
    let now: Date
    private let maxRows = 7

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("오늘 할 일").font(WFont.ui(14, .bold)).foregroundStyle(pal.t1)
                Text(WDate.label(now)).font(WFont.ui(12)).foregroundStyle(pal.muted)
                Spacer()
                Text("\(st.done)").font(WFont.num(18)).foregroundStyle(pal.fg)
                    + Text("/\(st.tasks.count)").font(WFont.num(18)).foregroundStyle(pal.muted)
            }
            if st.tasks.isEmpty {
                Spacer()
                HStack { Spacer(); Galpi(fill: pal.g2, mood: .sleep, size: 52); Spacer() }
                Text("오늘은 비어 있어요").font(WFont.ui(15, .bold)).foregroundStyle(pal.fg).frame(maxWidth: .infinity)
                Spacer()
            } else {
                ForEach(groups(), id: \.0) { g in
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 6) {
                            CatIcon(cat: st.cat(g.0), pal: pal, size: 12)
                            Text(st.cat(g.0)?.name ?? "할 일").font(WFont.ui(12, .bold))
                                .foregroundStyle(g.0 == "galpi" ? pal.t2 : pal.cat(st.cat(g.0)?.color ?? "g1"))
                        }
                        ForEach(g.1) { t in TaskRow(task: t, st: st, pal: pal, showCat: false, showNote: true) }
                    }
                }
                Spacer(minLength: 0)
            }
            Link(destination: WLink.home) {
                HStack(spacing: 4) {
                    Image(systemName: "plus").font(.system(size: 12, weight: .heavy))
                    Text("할 일 적기").font(WFont.ui(13, .bold))
                }
                .foregroundStyle(pal.t1)
                .frame(maxWidth: .infinity, minHeight: 34)
                .background(RoundedRectangle(cornerRadius: 12).strokeBorder(pal.t1.opacity(0.45), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// 카테고리 순서대로 묶되, 넘치면 안 한 일 먼저 잘라 담는다
    private func groups() -> [(String, [WTask])] {
        let shown = Array(st.tasks.prefix(maxRows))
        let order = st.cats.map(\.id)
        let ids = Array(Set(shown.map(\.cat))).sorted {
            (order.firstIndex(of: $0) ?? 99) < (order.firstIndex(of: $1) ?? 99)
        }
        return ids.map { id in (id, shown.filter { $0.cat == id }) }
    }
}

// MARK: - 잠금 화면

struct TodayCircular: View {
    let st: TodayState?
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Text("오늘").font(WFont.ui(12, .bold))
                Text(st.map { "\($0.done)/\($0.tasks.count)" } ?? "–").font(WFont.num(20))
            }
        }
        .widgetAccentable()
        .accessibilityLabel(st.map { "오늘 할 일 \($0.tasks.count)개 중 \($0.done)개 완료" } ?? "오늘 할 일")
    }
}

struct TodayInline: View {
    let st: TodayState?
    var body: some View {
        if let st {
            Text(st.tasks.isEmpty ? "오늘 할 일 없음" : st.left == 0 ? "오늘 할 일 다 함" : "할 일 \(st.left)개 남음")
        } else {
            Text("오늘 할 일")
        }
    }
}
