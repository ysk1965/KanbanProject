import Foundation

/// 앱과 위젯 확장이 같이 쓰는 App Group 저장소.
/// - 요약(snapshot): 앱(웹 코드)이 계산한 JSON 문자열 그대로. 위젯은 읽기만 한다.
/// - 대기열(pending): 위젯에서 누른 체크. 앱이 열릴 때 꺼내서(takePending) 노트·할 일 저장소에 옮긴다.
/// JSON 계약: frontend/src/app/components/personal/sermon/widget/widgetSnapshot.ts, utils/widgetBridge.ts
enum WidgetShared {
    static let appGroup = "group.com.bridgespots.app"
    static let snapshotKey = "widget.snapshot.v1"
    static let pendingKey = "widget.pending.v1"
    /// 대기열이 끝없이 쌓이지 않게 (앱을 오래 안 열어도 이만큼이면 충분)
    static let pendingMax = 200

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    static func snapshotData() -> Data? {
        defaults?.string(forKey: snapshotKey)?.data(using: .utf8)
    }

    static func writeSnapshot(_ json: String) {
        defaults?.set(json, forKey: snapshotKey)
    }

    static func clearSnapshot() {
        defaults?.removeObject(forKey: snapshotKey)
        defaults?.removeObject(forKey: pendingKey)
    }

    static func pendingOps() -> [[String: Any]] {
        guard let s = defaults?.string(forKey: pendingKey), let d = s.data(using: .utf8),
              let list = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]] else { return [] }
        return list
    }

    /// 같은 대상(같은 적용 · 같은 할 일의 같은 날)에 대한 예전 체크는 새 체크로 바꾼다
    static func appendPending(_ op: [String: Any]) {
        let target = targetKey(op)
        var list = pendingOps().filter { targetKey($0) != target }
        list.append(op)
        if list.count > pendingMax { list.removeFirst(list.count - pendingMax) }
        savePending(list)
    }

    /// 대기열을 JSON 문자열로 꺼내고 비운다
    static func takePending() -> String {
        let list = pendingOps()
        defaults?.removeObject(forKey: pendingKey)
        guard let d = try? JSONSerialization.data(withJSONObject: list),
              let s = String(data: d, encoding: .utf8) else { return "[]" }
        return s
    }

    static func targetKey(_ op: [String: Any]) -> String {
        let kind = op["op"] as? String ?? ""
        if kind == "apply" {
            return "apply|\(op["note_id"] as? String ?? "")|\(op["thought_id"] as? String ?? "")"
        }
        return "plan|\(op["plan_id"] as? String ?? "")|\(op["date"] as? String ?? "")"
    }

    private static func savePending(_ list: [[String: Any]]) {
        guard let d = try? JSONSerialization.data(withJSONObject: list),
              let s = String(data: d, encoding: .utf8) else { return }
        defaults?.set(s, forKey: pendingKey)
    }
}
