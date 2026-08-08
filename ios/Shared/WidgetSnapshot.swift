import Foundation

struct WidgetSnapshot: Codable, Equatable {
    struct Device: Codable, Equatable, Identifiable {
        let id: String
        let name: String
        let watts: Double
        let isFresh: Bool
    }

    let updatedAt: Date
    let serverName: String
    let isDemo: Bool
    let nowW: Double
    let todayPlugsKwh: Double
    let todayHouseKwh: Double?
    let devices: [Device]

    static let placeholder = WidgetSnapshot(
        updatedAt: Date(),
        serverName: "Wattelier",
        isDemo: true,
        nowW: 684,
        todayPlugsKwh: 2.67,
        todayHouseKwh: 8.42,
        devices: [
            Device(id: "bureau", name: "Bureau", watts: 146, isFresh: true),
            Device(id: "salon", name: "Télévision", watts: 92, isFresh: true),
            Device(id: "cuisine", name: "Lave-vaisselle", watts: 446, isFresh: true)
        ]
    )
}

enum WidgetSnapshotStore {
    static let appGroup = "group.com.n0thytvoff.Wattelier"
    private static let filename = "widget-snapshot.json"
    private static let defaultsKey = "widgetSnapshot.v2"

    private static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }

    static func load() -> WidgetSnapshot? {
        if let snapshot = load(from: containerURL) { return snapshot }
        guard let data = sharedDefaults?.data(forKey: defaultsKey) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    @discardableResult
    static func save(_ snapshot: WidgetSnapshot) -> Bool {
        guard let data = try? JSONEncoder().encode(snapshot) else { return false }
        let fileSaved = save(data, to: containerURL)
        sharedDefaults?.set(data, forKey: defaultsKey)
        let defaultsSaved = sharedDefaults?.synchronize() ?? false
        return fileSaved || defaultsSaved
    }

    static func clear() {
        guard let url = snapshotURL(in: containerURL) else { return }
        try? FileManager.default.removeItem(at: url)
        sharedDefaults?.removeObject(forKey: defaultsKey)
        sharedDefaults?.synchronize()
    }

    static func load(from directory: URL?) -> WidgetSnapshot? {
        guard let url = snapshotURL(in: directory), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    @discardableResult
    static func save(_ snapshot: WidgetSnapshot, to directory: URL?) -> Bool {
        guard let data = try? JSONEncoder().encode(snapshot) else { return false }
        return save(data, to: directory)
    }

    private static var sharedDefaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    private static func save(_ data: Data, to directory: URL?) -> Bool {
        guard let url = snapshotURL(in: directory) else { return false }
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: url, options: .atomic)
            return true
        } catch {
            return false
        }
    }

    private static func snapshotURL(in directory: URL?) -> URL? {
        directory?.appendingPathComponent(filename, isDirectory: false)
    }
}
