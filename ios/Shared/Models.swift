import Foundation

// MARK: - Core data models (shared between the iPhone and Watch apps)

/// A paired desktop computer running the QuickDesk agent.
struct Computer: Codable, Identifiable, Hashable {
    var id: String          // agent id returned from /pair
    var name: String
    var host: String        // IP or hostname on the LAN
    var port: Int
    var os: String          // "macOS" | "Windows" | "Linux"
    var token: String       // bearer token for this client
    var isActive: Bool = true

    var baseURL: URL? {
        Computer.endpointURL(host: host, port: port)
    }

    var wsURL: URL? {
        guard var components = baseURL.flatMap({ URLComponents(url: $0, resolvingAgainstBaseURL: false) }) else { return nil }
        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.path = "/ws"
        components.queryItems = [URLQueryItem(name: "token", value: token)]
        return components.url
    }

    func resolved(host: String, port: Int) -> Computer {
        var copy = self
        copy.host = host
        copy.port = port
        return copy
    }

    static func endpointURL(host rawHost: String, port: Int) -> URL? {
        let trimmed = rawHost.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !trimmed.isEmpty else { return nil }

        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            guard var components = URLComponents(string: trimmed) else { return nil }
            if components.port == nil { components.port = port }
            return components.url
        }

        return URL(string: "http://\(trimmed):\(port)")
    }
}

enum ActionType: String, Codable, CaseIterable {
    case openApp, openUrl, runCommand, runScript, systemAction
}

/// An action's command value. It is either a single string (same on every OS)
/// or a per-OS map ({ "darwin": ..., "win32": ..., "linux": ... }) so one task
/// runs the right command on macOS, Windows, or Linux. The app only displays
/// and triggers tasks, so it keeps the raw value and exposes a display string.
enum ActionValue: Codable, Hashable {
    case single(String)
    case perOS([String: String])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) {
            self = .single(string)
        } else if let map = try? container.decode([String: String].self) {
            self = .perOS(map)
        } else {
            self = .single("")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .single(let string): try container.encode(string)
        case .perOS(let map): try container.encode(map)
        }
    }

    /// A human-readable string for the UI (prefers the current platform).
    var display: String {
        switch self {
        case .single(let string):
            return string
        case .perOS(let map):
            #if os(macOS)
            return map["darwin"] ?? map.values.first ?? ""
            #else
            return map["darwin"] ?? map["win32"] ?? map["linux"] ?? map.values.first ?? ""
            #endif
        }
    }
}

struct TaskAction: Codable, Hashable {
    var type: ActionType
    var value: ActionValue
    var order: Int
}

enum TaskCategory: String, Codable, CaseIterable {
    case Work, Development, System, Media, Quick, Custom

    // Tolerate unknown categories from newer agents instead of failing to
    // decode the whole task list.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = TaskCategory(rawValue: raw) ?? .Custom
    }
}

/// A predefined task the agent can execute. Named `AgentTask` to avoid clashing
/// with Swift Concurrency's `Task`.
struct AgentTask: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var icon: String                 // SF Symbol name
    var category: TaskCategory = .Custom
    var requiresConfirmation: Bool = false
    var actions: [TaskAction] = []
}

enum ExecutionStatus: String, Codable {
    case success, failed, pending
}

struct ExecutionLog: Codable, Identifiable, Hashable {
    var id: String
    var taskId: String
    var taskName: String?
    var computerId: String
    var status: ExecutionStatus
    var startedAt: String
    var finishedAt: String?
    var output: String?
    var error: String?
}

// MARK: - Agent Diagnostics

struct AgentDiagnostics: Codable, Hashable {
    struct Agent: Codable, Hashable { var id: String; var name: String; var os: String }
    struct ProcessInfo: Codable, Hashable {
        struct Memory: Codable, Hashable {
            var rss: Int
            var heapUsed: Int
            var systemFree: Int
            var systemTotal: Int
        }
        var pid: Int
        var uptimeSeconds: Int
        var node: String
        var platform: String
        var arch: String
        var memoryMb: Memory
        var cpuCount: Int
    }
    struct PathInfo: Codable, Hashable {
        var AGENT_ROOT: String
        var REPO_ROOT: String
    }
    struct NetworkInfo: Codable, Hashable {
        var port: Int
        var host: String
        var addresses: [String]
        var lanUrls: [String]
        var tailnetUrls: [String]
    }
    struct TaskInfo: Codable, Hashable {
        var count: Int
        var favorites: Int
        var sensitive: Int
    }
    struct ApprovalInfo: Codable, Hashable {
        var pending: Int
        var sources: [String: Int]
    }
    struct ClientInfo: Codable, Hashable {
        var paired: Int
        var connectedPhones: Int
        var pushReady: Int
    }
    struct PushInfo: Codable, Hashable {
        var configured: Bool
        var environment: String?
        var topic: String?
    }

    var ok: Bool
    var agent: Agent
    var process: ProcessInfo
    var paths: PathInfo
    var network: NetworkInfo
    var tasks: TaskInfo
    var approvals: ApprovalInfo
    var clients: ClientInfo
    var push: PushInfo
    var autoPairing: Bool
    var pairingArmed: Bool
    var version: String
}

struct DeveloperPackResponse: Codable, Hashable {
    var ok: Bool
    var tasks: [AgentTask]
    var added: Int
    var updated: Int
}

// MARK: - Approvals (Claude/Codex permission prompts forwarded to the watch)

struct ApprovalRequest: Codable, Identifiable, Hashable {
    var id: String
    var source: String              // "claude"
    var title: String               // e.g. "Run command"
    var summary: String             // e.g. "rm -rf build/"
    var detail: String?
    var tool: String?
    var cwd: String?
    var status: String              // "pending" | "allowed" | "denied" | "expired"
}

// MARK: - Watch <-> Phone message envelope

/// Messages exchanged over WatchConnectivity. Encoded as a dictionary with a
/// `type` discriminator and a JSON `payload` string.
enum WatchMessageType: String, Codable {
    case state            // phone -> watch: full state (tasks + pending approvals)
    case tasks            // phone -> watch: full task list (legacy)
    case approval         // phone -> watch: new pending approval (legacy)
    case approvalResolved // phone -> watch: approval settled elsewhere (legacy)
    case status           // phone -> watch: execution result
    case execute          // watch -> phone: run a task
    case decision         // watch -> phone: approve/deny an approval
    case requestSync      // watch -> phone: please send current state
}

/// Combined state pushed phone -> watch over the reliable applicationContext
/// channel (tasks AND pending approvals together).
struct SyncPayload: Codable {
    var tasks: [AgentTask]
    var approvals: [ApprovalRequest]
    var isConnected: Bool = false
    var computerName: String?
    var computerAddress: String?
    var favoriteIDs: [String] = []      // ids within `tasks` the user starred on iPhone
    var lastLog: ExecutionLog?          // most recent execution result, for the watch status screen
}

enum WatchMessage {
    static let typeKey = "type"
    static let payloadKey = "payload"

    static func encode<T: Encodable>(_ type: WatchMessageType, _ payload: T) -> [String: Any] {
        let data = (try? JSONEncoder().encode(payload)) ?? Data()
        return [typeKey: type.rawValue, payloadKey: String(data: data, encoding: .utf8) ?? ""]
    }

    static func decode<T: Decodable>(_ dict: [String: Any], as: T.Type) -> (WatchMessageType, T)? {
        guard let raw = dict[typeKey] as? String,
              let type = WatchMessageType(rawValue: raw),
              let payloadStr = dict[payloadKey] as? String,
              let data = payloadStr.data(using: .utf8),
              let value = try? JSONDecoder().decode(T.self, from: data)
        else { return nil }
        return (type, value)
    }

    static func messageType(_ dict: [String: Any]) -> WatchMessageType? {
        (dict[typeKey] as? String).flatMap(WatchMessageType.init)
    }
}

// Small payload helpers
struct ExecuteRequest: Codable { var taskId: String; var confirmed: Bool }
struct DecisionRequest: Codable { var approvalId: String; var decision: String } // "allow"|"deny"
