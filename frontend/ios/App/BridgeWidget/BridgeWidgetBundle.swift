import SwiftUI
import WidgetKit

@main
struct BridgeWidgetBundle: WidgetBundle {
    var body: some Widget {
        QuestWidget()
        TodayWidget()
        VerseWidget()
    }
}

// MARK: - 타임라인

struct BridgeEntry: TimelineEntry {
    let date: Date
    let snap: WSnapshot?
    var source: VerseSource = .week
}

/// 다시 그릴 때: 지금 · (오늘 안이면) 적용 잠금이 풀리는 때 · 자정 (날이 바뀌면 오늘 칸·퀘스트 주가 바뀐다)
func entryDates(_ snap: WSnapshot?, now: Date) -> [Date] {
    let midnight = WDate.nextMidnight(after: now)
    var dates = [now]
    if let unlock = snap?.quest.target?.unlockAt, unlock > 0 {
        let d = Date(timeIntervalSince1970: unlock / 1000)
        if d > now && d < midnight { dates.append(d) }
    }
    dates.append(midnight.addingTimeInterval(5))
    return dates
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> BridgeEntry {
        BridgeEntry(date: Date(), snap: Sample.snapshot)
    }

    func getSnapshot(in context: Context, completion: @escaping (BridgeEntry) -> Void) {
        let snap = SnapshotStore.load()
        completion(BridgeEntry(date: Date(), snap: context.isPreview && snap == nil ? Sample.snapshot : snap))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BridgeEntry>) -> Void) {
        let snap = SnapshotStore.load()
        let entries = entryDates(snap, now: Date()).map { BridgeEntry(date: $0, snap: snap) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct VerseProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> BridgeEntry {
        BridgeEntry(date: Date(), snap: Sample.snapshot)
    }

    func snapshot(for configuration: VerseConfigIntent, in context: Context) async -> BridgeEntry {
        let snap = SnapshotStore.load()
        return BridgeEntry(
            date: Date(), snap: context.isPreview && snap == nil ? Sample.snapshot : snap,
            source: configuration.source)
    }

    func timeline(for configuration: VerseConfigIntent, in context: Context) async -> Timeline<BridgeEntry> {
        let snap = SnapshotStore.load()
        let now = Date()
        let entries = [now, WDate.nextMidnight(after: now).addingTimeInterval(5)].map {
            BridgeEntry(date: $0, snap: snap, source: configuration.source)
        }
        return Timeline(entries: entries, policy: .atEnd)
    }
}

// MARK: - 위젯 갤러리·자리 표시용 예시

enum Sample {
    static var snapshot: WSnapshot? {
        let now = Date()
        let today = WDate.ymd(now)
        let monday = WDate.monday(now)
        let json = """
        {"v":1,"generated_at":0,"signed_in":true,
         "ink":{"g1":"#c3b5f5","g2":"#ffb3d1","g3":"#a9dfc6","t1":"#5a45b8","t2":"#b8336f","g1d":"#cbbff7","g2d":"#ffbfd8","g3d":"#b5e6cf","paper":"#fcf8fb","desk":"#f3ecf3","card":"#fffdfe","card2":"#f6eff6"},
         "quest":{"week_start":"\(monday)","note":true,"apply":true,"done":false,"earned":23,"total":53,"streak_weeks":3,
           "sermon":{"id":"s","date":"\(monday)","title":"설교 제목","ref":"로마서 5:3-4"},
           "note_date":"\(monday)","apply_at":0,"done_at":null,
           "target":{"note_id":"s","thought_id":"t","text":"적용 한 가지","unlock_at":0},
           "bonus":{"notes":1,"notes_max":3,"done":0,"done_max":5}},
         "today":{"week":"\(monday)","cats":[{"id":"galpi","name":"예배 갈피","color":"g2","icon":"ribbon"},{"id":"todo","name":"할 일","color":"g1","icon":"tag"}],
           "days":{"\(today)":[
             {"key":"a","text":"적용 한 가지","cat":"galpi","rep":"once","done":false,"carry":null,"kind":"apply","plan_id":null,"note_id":"s","thought_id":"t","note_date":"\(monday)"},
             {"key":"b","text":"할 일","cat":"todo","rep":"once","done":true,"carry":null,"kind":"plan","plan_id":"b","note_id":null,"thought_id":null,"note_date":null}]}},
         "verse":{"week":{"text":"다만 이뿐 아니라 우리가 환난 중에도 즐거워하나니 이는 환난은 인내를, 인내는 연단을, 연단은 소망을 이루는 줄 앎이로다","ref":"로마서 5:3-4","b":44,"c":5,"v":3,"note_id":"s","title":"설교 제목","date":"\(monday)"},
           "lines":{},"reading":null}}
        """
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        return try? dec.decode(WSnapshot.self, from: Data(json.utf8))
    }
}

// MARK: - 공통 조각

/// 앱에서 아직 요약을 안 보냈을 때
struct EmptyHint: View {
    let pal: Palette
    let title: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(WFont.ui(12, .bold)).foregroundStyle(pal.t2)
            Spacer(minLength: 0)
            Galpi(fill: pal.g2, mood: .sleep, size: 34)
            Text("앱에서 설교 노트를 한 번 열면 여기에 보여요")
                .font(WFont.ui(13, .medium)).foregroundStyle(pal.fg)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

extension View {
    func widgetBackground(_ color: Color) -> some View {
        containerBackground(for: .widget) { color }
    }
}

/// 알약 버튼 모양
struct PillLabel: View {
    let text: String
    var icon: String? = nil
    let fill: Color
    var ink: Color = .white
    var body: some View {
        HStack(spacing: 4) {
            if let icon { Image(systemName: icon).font(.system(size: 11, weight: .heavy)) }
            Text(text).font(WFont.ui(13, .bold)).lineLimit(1)
        }
        .foregroundStyle(ink)
        .padding(.horizontal, 14)
        .frame(minHeight: 34)
        .background(Capsule().fill(fill))
    }
}
