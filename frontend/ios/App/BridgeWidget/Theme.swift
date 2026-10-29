import SwiftUI

/// 설교 노트 「스티커 다이어리」 토큰 (sermon.css). 잉크는 앱에서 고른 색을 요약에 실어 보낸다.
/// 라이트 = 종이, 다크 = 밤 종이(면은 진한 회보라, 잉크는 밝은 쪽 g1d·g2d 를 글자에도 쓴다).
struct Palette {
    let g1, g2, g3: Color
    /// 글자용 진한 잉크 (라이트) · 밝은 잉크 (다크)
    let t1, t2: Color
    let bg, surface, surface2: Color
    let fg, muted: Color
    /// 잉크 면 위 글자
    let onInk: Color
    let line: Color
    let dark: Bool

    static let fallback = WInk(
        g1: "#c3b5f5", g2: "#ffb3d1", g3: "#a9dfc6", t1: "#5a45b8", t2: "#b8336f",
        g1d: "#cbbff7", g2d: "#ffbfd8", g3d: "#b5e6cf", paper: "#fcf8fb", desk: "#f3ecf3",
        card: "#fffdfe", card2: "#f6eff6")

    init(_ ink: WInk?, _ scheme: ColorScheme) {
        let i = ink ?? Palette.fallback
        dark = scheme == .dark
        if dark {
            g1 = Color(hex: i.g1d); g2 = Color(hex: i.g2d); g3 = Color(hex: i.g3d)
            t1 = g1; t2 = g2
            bg = Color(hex: "#16151c"); surface = Color(hex: "#1e1d26"); surface2 = Color(hex: "#272632")
            fg = Color(hex: "#eeedf3"); muted = Color(hex: "#aaa6b6")
            onInk = Color(hex: "#1b1a1f"); line = Color.white.opacity(0.1)
        } else {
            g1 = Color(hex: i.g1); g2 = Color(hex: i.g2); g3 = Color(hex: i.g3)
            t1 = Color(hex: i.t1); t2 = Color(hex: i.t2)
            bg = Color(hex: i.paper); surface = Color(hex: i.card); surface2 = Color(hex: i.card2)
            fg = Color(hex: "#1d1b24"); muted = Color(hex: "#625e6d")
            onInk = Color(hex: "#1d1b24"); line = Color.black.opacity(0.1)
        }
    }

    /// 민트 면(오늘 읽을 곳·다 한 날) 위 진한 초록 글자
    var mintInk: Color { dark ? Color(hex: "#0f3f31") : Color(hex: "#12513f") }

    /// 한 주 동안 카테고리 색 (weekPlan CatColor)
    func cat(_ token: String) -> Color {
        switch token {
        case "g1": return dark ? g1 : t1
        case "g2": return dark ? g2 : t2
        case "g3": return dark ? g3 : Color(hex: "#2d6a45")
        case "purple": return Color(hex: dark ? "#c3a8ef" : "#5f3d9c")
        case "orange": return Color(hex: dark ? "#e7aa6b" : "#9a5410")
        case "green": return Color(hex: dark ? "#8fcca5" : "#2d6a45")
        case "red": return Color(hex: dark ? "#f09a90" : "#a3271f")
        default: return t1
        }
    }
}

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        self.init(
            .sRGB,
            red: Double((v >> 16) & 0xff) / 255,
            green: Double((v >> 8) & 0xff) / 255,
            blue: Double(v & 0xff) / 255,
            opacity: 1)
    }
}

enum WFont {
    /// 큰 숫자·도장 — 앱의 Black Han Sans 자리
    static func num(_ size: CGFloat) -> Font { .system(size: size, weight: .heavy, design: .rounded) }
    /// 성경 본문 — 앱의 Hahmlet 자리
    static func verse(_ size: CGFloat, bold: Bool = false) -> Font {
        .system(size: size, weight: bold ? .bold : .medium, design: .serif)
    }
    static func ui(_ size: CGFloat, _ w: Font.Weight = .regular) -> Font { .system(size: size, weight: w) }
}

/// 망점 (리소 톤) — 잉크 면 귀퉁이에 살짝
struct Halftone: View {
    var color: Color
    var spacing: CGFloat = 7
    var dot: CGFloat = 2.2

    var body: some View {
        Canvas { ctx, size in
            var y: CGFloat = spacing / 2
            while y < size.height {
                var x: CGFloat = spacing / 2
                while x < size.width {
                    ctx.fill(Path(ellipseIn: CGRect(x: x - dot / 2, y: y - dot / 2, width: dot, height: dot)), with: .color(color))
                    x += spacing
                }
                y += spacing
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// 가름끈 아이콘 (예배 갈피)
struct Ribbon: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.midX, y: r.maxY - r.height * 0.2))
        p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        p.closeSubpath()
        return p
    }
}

/// 마스코트 「갈피」 — 둥근 모서리 가름끈 + 눈 두 개
struct Galpi: View {
    enum Mood { case idle, happy, sleep }
    var fill: Color
    var mood: Mood = .idle
    var size: CGFloat = 40

    var body: some View {
        // Mascot.tsx 의 갈피 모양 (viewBox -6 -14 112 124) 을 그대로 줄였다
        Canvas { ctx, sz in
            let s = sz.width / 112
            func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: (x + 6) * s, y: (y + 14) * s) }
            var body = Path()
            body.move(to: pt(30, 6))
            body.addLine(to: pt(70, 6))
            body.addQuadCurve(to: pt(78, 14), control: pt(78, 6))
            body.addLine(to: pt(78, 94))
            body.addLine(to: pt(50, 79))
            body.addLine(to: pt(22, 94))
            body.addLine(to: pt(22, 14))
            body.addQuadCurve(to: pt(30, 6), control: pt(22, 6))
            body.closeSubpath()
            ctx.fill(body, with: .color(fill))
            ctx.fill(Path(roundedRect: CGRect(origin: pt(30, 14), size: CGSize(width: 6 * s, height: 22 * s)), cornerRadius: 3 * s), with: .color(.white.opacity(0.6)))
            let ink = Color(hex: "#1d1b24")
            switch mood {
            case .idle:
                for x in [36.0, 55.5] {
                    ctx.fill(Path(roundedRect: CGRect(origin: pt(x, 34), size: CGSize(width: 8.5 * s, height: 16 * s)), cornerRadius: 4.25 * s), with: .color(ink))
                }
            case .happy, .sleep:
                for x in [35.0, 55.0] {
                    var e = Path()
                    e.move(to: pt(x, 44))
                    e.addQuadCurve(to: pt(x + 10, 44), control: pt(x + 5, mood == .happy ? 36 : 48))
                    ctx.stroke(e, with: .color(ink), style: StrokeStyle(lineWidth: 4 * s, lineCap: .round))
                }
            }
        }
        .frame(width: size, height: size * 124 / 112)
        .accessibilityHidden(true)
    }
}

/// 달란트 동전 (겨자씨 새싹)
struct Coin: View {
    var size: CGFloat = 13
    var body: some View {
        ZStack {
            Circle().fill(Color(hex: "#f6cf5a"))
            Circle().stroke(Color(hex: "#b98a12"), lineWidth: size * 0.08)
            Image(systemName: "leaf.fill")
                .font(.system(size: size * 0.5, weight: .bold))
                .foregroundStyle(Color(hex: "#7a5a00"))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// 앱 링크 (deepLinks.ts 가 bridgespots://app/… 를 경로로 바꾼다)
enum WLink {
    static func sermon(_ query: String = "") -> URL {
        URL(string: "bridgespots://app/sermonnote\(query.isEmpty ? "" : "?\(query)")")!
    }
    static let challenge = sermon("tab=challenge")
    static let home = sermon()
    static func note(_ id: String) -> URL {
        sermon("note=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id)")
    }
    static func bible(_ chapter: String?) -> URL {
        guard let chapter else { return sermon("tab=bible") }
        return sermon("tab=bible&wch=\(chapter)")
    }
}
