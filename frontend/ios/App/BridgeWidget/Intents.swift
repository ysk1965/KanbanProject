import AppIntents
import WidgetKit

/// 위젯 안의 체크 버튼 (iOS 17 대화형 위젯). 서버는 못 부르니 App Group 대기열에 「이 상태로」를 적고,
/// 앱이 열릴 때 노트·할 일 저장소에 옮긴다 (widgetPending.ts). 화면은 대기열을 덧입혀 바로 바뀐다.

struct ToggleTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "할 일 체크"
    static var isDiscoverable: Bool = false

    /// apply = 설교 적용, plan = 직접 적은 할 일
    @Parameter(title: "종류") var kind: String
    @Parameter(title: "바꿀 상태") var done: Bool
    @Parameter(title: "노트") var noteId: String
    @Parameter(title: "적용") var thoughtId: String
    @Parameter(title: "할 일") var planId: String
    @Parameter(title: "반복") var rep: String
    @Parameter(title: "날짜") var date: String
    @Parameter(title: "주") var week: String

    init() {}

    init(task: WTask, done: Bool, date: String, week: String) {
        kind = task.kind
        self.done = done
        noteId = task.noteId ?? ""
        thoughtId = task.thoughtId ?? ""
        planId = task.planId ?? ""
        rep = task.rep
        self.date = date
        self.week = week
    }

    func perform() async throws -> some IntentResult {
        var op: [String: Any] = [
            "id": UUID().uuidString,
            "op": kind == "apply" ? "apply" : "plan",
            "done": done,
            "at": Date().timeIntervalSince1970 * 1000,
            "date": date,
            "week": week,
        ]
        if kind == "apply" {
            op["note_id"] = noteId
            op["thought_id"] = thoughtId
        } else {
            op["plan_id"] = planId
            op["rep"] = rep
        }
        WidgetShared.appendPending(op)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

/// 갈피 퀘스트 「살아 냈어요」 — 적용 하나를 실천으로
struct LiveApplyIntent: AppIntent {
    static var title: LocalizedStringResource = "살아 냈어요"
    static var isDiscoverable: Bool = false

    @Parameter(title: "노트") var noteId: String
    @Parameter(title: "적용") var thoughtId: String

    init() {}

    init(noteId: String, thoughtId: String) {
        self.noteId = noteId
        self.thoughtId = thoughtId
    }

    func perform() async throws -> some IntentResult {
        WidgetShared.appendPending([
            "id": UUID().uuidString,
            "op": "apply",
            "done": true,
            "at": Date().timeIntervalSince1970 * 1000,
            "note_id": noteId,
            "thought_id": thoughtId,
        ])
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

/// 오늘의 말씀 위젯 — 어디서 가져올지 (위젯 길게 눌러 「위젯 편집」)
enum VerseSource: String, AppEnum {
    case week, line, reading

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "말씀 출처"
    static var caseDisplayRepresentations: [VerseSource: DisplayRepresentation] = [
        .week: "이번 주 설교 말씀",
        .line: "내가 밑줄 친 말씀",
        .reading: "오늘 읽을 곳",
    ]
}

struct VerseConfigIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "오늘의 말씀"
    static var description = IntentDescription("위젯에 띄울 말씀을 골라요.")

    @Parameter(title: "말씀 출처", default: .week) var source: VerseSource

    init() {}
}
