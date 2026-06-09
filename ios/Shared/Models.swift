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
        if host.hasPrefix("http://") || host.hasPrefix("https://") {
            return URL(string: host.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        }
        return URL(string: "http://\(host):\(port)")
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
}

enum ActionType: String, Codable, CaseIterable {
    case openApp, openUrl, runCommand, runScript, systemAction
}

struct TaskAction: Codable, Hashable {
    var type: ActionType
    var value: String
    var order: Int
}

enum TaskCategory: String, Codable, CaseIterable {
    case Work, Development, System, Custom
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
