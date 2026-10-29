import Foundation

// 앱이 App Group 에 써 둔 요약 (widgetSnapshot.ts 의 WidgetSnapshot 과 같은 모양, 필드는 snake_case → camelCase 로 읽는다)

struct WSnapshot: Decodable {
    let v: Int
    let generatedAt: Double
    let signedIn: Bool
    let ink: WInk
    var quest: WQuest
    var today: WToday
    let verse: WVerse
}

struct WInk: Decodable {
    let g1, g2, g3, t1, t2, g1d, g2d, g3d, paper, desk, card, card2: String
}

struct WQuest: Decodable {
    let weekStart: String
    var note: Bool
    var apply: Bool
    var done: Bool
    var earned: Int
    let total: Int
    let streakWeeks: Int?
    let sermon: WSermon?
    let noteDate: String?
    let applyAt: Double?
    var doneAt: Double?
    let target: WTarget?
    var bonus: WBonus
}

struct WSermon: Decodable {
    let id: String
    let date: String
    let title: String
    let ref: String?
}

struct WTarget: Decodable {
    let noteId: String
    let thoughtId: String
    let text: String
    let unlockAt: Double
}

struct WBonus: Decodable {
    var notes: Int
    let notesMax: Int
    var done: Int
    let doneMax: Int
}

struct WToday: Decodable {
    let week: String
    let cats: [WCat]
    var days: [String: [WTask]]
}

struct WCat: Decodable {
    let id: String
    let name: String
    let color: String
    let icon: String
}

struct WTask: Decodable, Identifiable {
    let key: String
    let text: String
    let cat: String
    let rep: String
    var done: Bool
    let carry: String?
    let kind: String
    let planId: String?
    let noteId: String?
    let thoughtId: String?
    let noteDate: String?
    var id: String { key }
}

struct WVerse: Decodable {
    let week: WVerseWeek?
    let lines: [String: WLine]
    let reading: WReading?
}

struct WVerseWeek: Decodable {
    let text: String
    let ref: String
    let b: Int
    let c: Int
    let v: Int
    let noteId: String
    let title: String
    let date: String
}

struct WLine: Decodable {
    let text: String
    let ref: String
    let b: Int
    let c: Int
    let v: Int
    let memo: String
    let at: Double
}

struct WReading: Decodable {
    let date: String
    let planTitle: String
    let label: String
    let short: String
    let chapters: [WChapter]
    let late: Int
    let others: Int
    let next: String?
}

struct WChapter: Decodable {
    let chapter: String
    let done: Bool
}

// MARK: - 날짜

enum WDate {
    static var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = .current
        return c
    }

    static func ymd(_ d: Date) -> String {
        let p = cal.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", p.year ?? 0, p.month ?? 0, p.day ?? 0)
    }

    /// 퀘스트 주 시작 (월요일)
    static func monday(_ d: Date) -> String {
        let start = cal.startOfDay(for: d)
        let wd = cal.component(.weekday, from: start) // 일=1 … 토=7
        return ymd(cal.date(byAdding: .day, value: -((wd + 5) % 7), to: start) ?? start)
    }

    static func nextMidnight(after d: Date) -> Date {
        cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: d)) ?? d.addingTimeInterval(86_400)
    }

    /// "10.29 (목)"
    static func label(_ d: Date) -> String {
        let p = cal.dateComponents([.month, .day, .weekday], from: d)
        let w = Array("일월화수목금토")[((p.weekday ?? 1) - 1) % 7]
        return "\(p.month ?? 0).\(p.day ?? 0) (\(w))"
    }

    /// "yyyy-MM-dd" → "10.25"
    static func short(_ s: String?) -> String {
        guard let s, s.count == 10 else { return "" }
        let parts = s.split(separator: "-").compactMap { Int($0) }
        return parts.count == 3 ? "\(parts[1]).\(parts[2])" : ""
    }

    static func weekday(_ d: Date) -> String {
        let wd = cal.component(.weekday, from: d)
        return String(Array("일월화수목금토")[(wd - 1) % 7])
    }

    /// 오후 9:40 같은 시각
    static func clock(_ ms: Double) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "a h:mm"
        return f.string(from: Date(timeIntervalSince1970: ms / 1000))
    }
}

// MARK: - 읽기 + 위젯에서 누른 체크 덧입히기

enum SnapshotStore {
    static func load() -> WSnapshot? {
        guard let data = WidgetShared.snapshotData() else { return nil }
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        guard var snap = try? dec.decode(WSnapshot.self, from: data) else { return nil }
        overlay(&snap, WidgetShared.pendingOps())
        return snap
    }

    /// 앱이 아직 옮기지 않은 위젯 체크를 화면에 미리 반영한다 (앱이 옮기고 나면 새 요약이 덮어쓴다)
    static func overlay(_ s: inout WSnapshot, _ ops: [[String: Any]]) {
        for op in ops {
            guard let kind = op["op"] as? String, let done = op["done"] as? Bool else { continue }
            if kind == "apply" {
                let nid = op["note_id"] as? String, tid = op["thought_id"] as? String
                for (day, list) in s.today.days {
                    s.today.days[day] = list.map { t in
                        var t = t
                        if t.noteId == nid && t.thoughtId == tid { t.done = done }
                        return t
                    }
                }
                if done, let tg = s.quest.target, tg.noteId == nid, tg.thoughtId == tid, !s.quest.done {
                    s.quest.done = true
                    s.quest.apply = true
                    s.quest.doneAt = op["at"] as? Double
                    s.quest.bonus.done = min(s.quest.bonus.done + 1, s.quest.bonus.doneMax)
                    s.quest.earned = (s.quest.note ? 20 : 0) + 3 + 10 + (s.quest.note ? 20 : 0)
                }
            } else if kind == "plan" {
                let pid = op["plan_id"] as? String, date = op["date"] as? String ?? ""
                guard var list = s.today.days[date] else { continue }
                list = list.map { t in
                    var t = t
                    if t.planId == pid { t.done = done }
                    return t
                }
                s.today.days[date] = list
            }
        }
    }
}
