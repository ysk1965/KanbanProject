import SwiftUI
import WidgetKit

/// 「오늘의 말씀」 — A 이번 주 설교 말씀 · B 내가 밑줄 친 말씀(날마다 하나) · C 오늘 읽을 곳.
/// 고른 출처가 비어 있으면 A → B → C 순서로 있는 것을 보여 준다.
struct VerseWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "BridgeVerse", intent: VerseConfigIntent.self, provider: VerseProvider()) { entry in
            VerseView(entry: entry)
        }
        .configurationDisplayName("오늘의 말씀")
        .description("이번 주 설교 말씀, 내가 밑줄 친 말씀, 오늘 읽을 곳 중에서 골라요.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

enum VerseContent {
    case week(WVerseWeek)
    case line(WLine)
    case reading(WReading)
}

func resolveVerse(_ snap: WSnapshot?, _ source: VerseSource, now: Date) -> VerseContent? {
    guard let v = snap?.verse else { return nil }
    let today = WDate.ymd(now)
    let week = v.week.map(VerseContent.week)
    let line = v.lines[today].map(VerseContent.line)
    // 읽을 곳은 그날 받은 것만 (다음 날은 앱이 새로 받아야 안다)
    let reading = v.reading.flatMap { $0.date == today ? VerseContent.reading($0) : nil }
    switch source {
    case .week: return week ?? line ?? reading
    case .line: return line ?? week ?? reading
    case .reading: return reading ?? week ?? line
    }
}

struct VerseView: View {
    let entry: BridgeEntry
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let pal = Palette(entry.snap?.ink, scheme)
        let content = resolveVerse(entry.snap, entry.source, now: entry.date)
        Group {
            if family == .accessoryRectangular {
                VerseRect(content: content)
            } else if let content {
                switch content {
                case .week(let w): WeekVerse(w: w, pal: pal, wide: family == .systemMedium)
                case .line(let l): LineVerse(l: l, pal: pal, wide: family == .systemMedium)
                case .reading(let r): ReadingView(r: r, pal: pal, wide: family == .systemMedium)
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("오늘의 말씀").font(WFont.ui(12, .bold)).foregroundStyle(pal.t1)
                    Spacer(minLength: 0)
                    Text("설교 노트에 말씀을 꽂거나 성경에 형광펜을 칠하면 여기에 떠요")
                        .font(WFont.ui(13, .medium)).foregroundStyle(pal.fg)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .widgetURL(link(content))
        .widgetBackground(background(pal, content))
    }

    private func link(_ c: VerseContent?) -> URL {
        switch c {
        case .week(let w): return WLink.note(w.noteId)
        case .line(let l): return WLink.bible("\(l.b):\(l.c)")
        case .reading(let r): return WLink.bible(r.next)
        case nil: return WLink.home
        }
    }

    private func background(_ pal: Palette, _ c: VerseContent?) -> Color {
        if family == .accessoryRectangular { return .clear }
        switch c {
        case .week: return family == .systemSmall ? pal.g1 : pal.surface
        case .reading(let r): return family == .systemSmall && r.next == nil ? pal.g3 : pal.bg
        default: return pal.bg
        }
    }
}

// MARK: - A 이번 주 설교 말씀

struct WeekVerse: View {
    let w: WVerseWeek
    let pal: Palette
    let wide: Bool

    var body: some View {
        if wide {
            HStack(spacing: 14) {
                RoundedRectangle(cornerRadius: 4).fill(pal.g2).frame(width: 10)
                VStack(alignment: .leading, spacing: 0) {
                    Text("이번 주 말씀 · \(w.ref)").font(WFont.ui(12, .bold)).foregroundStyle(pal.t2).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(w.text).font(WFont.verse(15)).foregroundStyle(pal.fg).lineSpacing(3).lineLimit(3)
                    Spacer(minLength: 4)
                    Text("\(WDate.short(w.date)) · \(w.title)").font(WFont.ui(12)).foregroundStyle(pal.muted).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Text("이번 주 말씀").font(WFont.ui(12, .bold)).foregroundStyle(pal.dark ? pal.onInk : pal.t1)
                Spacer(minLength: 4)
                Text(w.text).font(WFont.verse(14)).foregroundStyle(pal.onInk).lineSpacing(2).lineLimit(4).minimumScaleFactor(0.85)
                Spacer(minLength: 4)
                Text(w.ref).font(WFont.ui(12, .bold)).foregroundStyle(pal.dark ? pal.onInk : pal.t1)
                    .padding(.horizontal, 9).padding(.vertical, 3)
                    .background(Capsule().fill(pal.surface.opacity(pal.dark ? 0.5 : 1)))
                    .rotationEffect(.degrees(-3))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(alignment: .topTrailing) {
                Halftone(color: pal.t1.opacity(0.22)).frame(width: 90, height: 90).clipShape(Circle()).offset(x: 34, y: -34)
            }
        }
    }
}

// MARK: - B 내가 밑줄 친 말씀

struct LineVerse: View {
    let l: WLine
    let pal: Palette
    let wide: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(wide ? "오늘의 한 줄 · \(l.ref)" : "오늘의 한 줄").font(WFont.ui(12, .bold)).foregroundStyle(pal.cat("g3")).lineLimit(1)
                Spacer(minLength: 2)
                if wide, l.at > 0 {
                    Text("\(WDate.short(WDate.ymd(Date(timeIntervalSince1970: l.at / 1000)))) 밑줄").font(WFont.ui(12)).foregroundStyle(pal.muted)
                }
            }
            Spacer(minLength: 4)
            Text(l.text).font(WFont.verse(wide ? 16 : 15, bold: true)).foregroundStyle(pal.fg)
                .lineSpacing(3).lineLimit(wide ? 2 : 4).minimumScaleFactor(0.85)
                .padding(.horizontal, 2)
                .background(alignment: .bottom) {
                    Rectangle().fill(pal.g3.opacity(pal.dark ? 0.35 : 0.75)).frame(height: 8).offset(y: -2)
                }
            Spacer(minLength: 4)
            if wide, !l.memo.isEmpty {
                HStack(spacing: 8) {
                    Ribbon().fill(pal.g2).frame(width: 9, height: 12)
                    Text("내 생각 — \(l.memo)").font(WFont.ui(12)).foregroundStyle(pal.fg).lineLimit(1)
                }
                .padding(.horizontal, 10).padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: 12).fill(pal.surface2))
            } else {
                Text(wide ? "눌러서 성경에서 이어 읽기" : l.ref).font(WFont.ui(12)).foregroundStyle(pal.muted).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - C 오늘 읽을 곳

struct BookSticker: View {
    let short: String
    let pal: Palette
    var big = false

    var body: some View {
        let parts = short.split(separator: " ", maxSplits: 1).map(String.init)
        VStack(spacing: big ? 4 : 0) {
            Text(parts.first ?? short).font(WFont.num(big ? 30 : 22))
            if big, parts.count > 1 { Text(parts[1]).font(WFont.num(22)) }
        }
        .foregroundStyle(pal.mintInk)
        .frame(width: big ? 96 : 52, height: big ? 120 : 62)
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: big ? 18 : 14, style: .continuous).fill(pal.g3)
                Halftone(color: Color(hex: "#1d7b62").opacity(0.18))
                    .clipShape(RoundedRectangle(cornerRadius: big ? 18 : 14, style: .continuous))
            }
        )
        .rotationEffect(.degrees(big ? -4 : -5))
        .accessibilityHidden(true)
    }
}

struct ReadingDots: View {
    let r: WReading
    let pal: Palette
    var body: some View {
        HStack(spacing: 5) {
            ForEach(Array(r.chapters.prefix(6).enumerated()), id: \.offset) { _, c in
                Circle()
                    .fill(c.done ? pal.t1 : .clear)
                    .overlay(Circle().strokeBorder(pal.t1, lineWidth: c.done ? 0 : 2))
                    .frame(width: 9, height: 9)
            }
        }
        .accessibilityHidden(true)
    }
}

func readingLeft(_ r: WReading) -> String {
    let left = r.chapters.filter { !$0.done }.count + r.late
    if left == 0 { return "다 읽었어요" }
    return r.late > 0 ? "밀린 장 \(r.late) · \(left)장 남음" : "\(left)장 남음"
}

struct ReadingView: View {
    let r: WReading
    let pal: Palette
    let wide: Bool

    var body: some View {
        if wide {
            HStack(spacing: 16) {
                BookSticker(short: r.short, pal: pal, big: true)
                VStack(alignment: .leading, spacing: 6) {
                    Text("오늘 읽을 곳 · \(r.planTitle)").font(WFont.ui(12, .bold)).foregroundStyle(pal.t1).lineLimit(1)
                    Text(r.label).font(WFont.ui(18, .bold)).foregroundStyle(pal.fg).lineLimit(1).minimumScaleFactor(0.8)
                    HStack(spacing: 6) {
                        ReadingDots(r: r, pal: pal)
                        Text(readingLeft(r) + (r.others > 0 ? " · 외 \(r.others)길" : ""))
                            .font(WFont.ui(12)).foregroundStyle(pal.muted).lineLimit(1)
                    }
                    if r.next != nil {
                        PillLabel(text: "이어 읽기", fill: pal.t1, ink: pal.dark ? pal.onInk : .white).padding(.top, 2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else if r.next == nil {
            VStack(alignment: .leading, spacing: 0) {
                Text("오늘 읽을 곳").font(WFont.ui(12, .bold)).foregroundStyle(pal.mintInk)
                Spacer(minLength: 2)
                VStack(spacing: 0) {
                    Text("다 읽음").font(WFont.num(17))
                    Text(r.short).font(WFont.ui(12, .bold))
                }
                .foregroundStyle(pal.mintInk)
                .frame(width: 76, height: 76)
                .overlay(Circle().strokeBorder(pal.mintInk, lineWidth: 3))
                .rotationEffect(.degrees(-10))
                .frame(maxWidth: .infinity)
                Spacer(minLength: 2)
                Text(r.planTitle).font(WFont.ui(12)).foregroundStyle(pal.mintInk).lineLimit(1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Text("오늘 읽을 곳").font(WFont.ui(12, .bold)).foregroundStyle(pal.t1)
                Spacer(minLength: 4)
                HStack(spacing: 10) {
                    BookSticker(short: r.short, pal: pal)
                    Text(r.short.split(separator: " ").dropFirst().joined(separator: " "))
                        .font(WFont.num(24)).foregroundStyle(pal.fg).lineLimit(1).minimumScaleFactor(0.6)
                }
                Spacer(minLength: 4)
                HStack(spacing: 5) {
                    ReadingDots(r: r, pal: pal)
                    Text(readingLeft(r)).font(WFont.ui(12)).foregroundStyle(pal.muted).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

// MARK: - 잠금 화면 (사각)

struct VerseRect: View {
    let content: VerseContent?
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            switch content {
            case .reading(let r):
                Text("오늘 읽을 곳").font(WFont.ui(12, .bold)).widgetAccentable()
                Text(r.label).font(WFont.ui(15, .bold)).lineLimit(1)
                Text(readingLeft(r)).font(WFont.ui(12)).lineLimit(1)
            case .week(let w):
                Text(w.ref).font(WFont.ui(12, .bold)).widgetAccentable()
                Text(w.text).font(WFont.verse(13)).lineLimit(2)
            case .line(let l):
                Text(l.ref).font(WFont.ui(12, .bold)).widgetAccentable()
                Text(l.text).font(WFont.verse(13)).lineLimit(2)
            case nil:
                Text("오늘의 말씀").font(WFont.ui(12, .bold))
                Text("앱에서 설교 노트를 열어 주세요").font(WFont.ui(12)).lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
