import Foundation

/// Async HTTP client for talking to a desktop agent over the LAN.
struct AgentClient {
    let computer: Computer

    enum ClientError: LocalizedError {
        case badURL, http(Int, String), decoding
        var errorDescription: String? {
            switch self {
            case .badURL: return "Invalid agent address"
            case .http(let code, let body): return "Agent error \(code): \(body)"
            case .decoding: return "Unexpected response from agent"
            }
        }
    }

    private func request(_ path: String, method: String = "GET", body: Encodable? = nil, auth: Bool = true) async throws -> Data {
        let target = await resolvedComputer()
        guard let base = target.baseURL, let url = URL(string: path, relativeTo: base) else {
            throw ClientError.badURL
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 15
        if auth { req.setValue("Bearer \(target.token)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw ClientError.decoding }
        guard (200..<300).contains(http.statusCode) else {
            throw ClientError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }

    private func resolvedComputer() async -> Computer {
        guard let endpoint = await AgentDiscovery.shared.endpoint(for: computer) else { return computer }
        return computer.resolved(host: endpoint.host, port: endpoint.port)
    }

    // MARK: - Endpoints

    private static func baseURL(host: String, port: Int) -> URL? {
        if host.hasPrefix("http://") || host.hasPrefix("https://") {
            return URL(string: host.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        }
        return URL(string: "http://\(host):\(port)")
    }

    private static func url(_ path: String, host: String, port: Int) -> URL? {
        guard let base = baseURL(host: host, port: port) else { return nil }
        return URL(string: path, relativeTo: base)
    }

    struct HealthResponse: Codable {
        struct Agent: Codable { var id: String; var name: String; var os: String }
        var ok: Bool; var agent: Agent; var pairingArmed: Bool?; var autoPairing: Bool?
    }

    /// Static health check used before pairing (no token yet).
    static func health(host: String, port: Int) async throws -> HealthResponse {
        guard let url = url("/health", host: host, port: port) else { throw ClientError.badURL }
        var req = URLRequest(url: url); req.timeoutInterval = 8
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else { throw ClientError.decoding }
        return try JSONDecoder().decode(HealthResponse.self, from: data)
    }

    struct PairResponse: Codable {
        struct Agent: Codable { var id: String; var name: String; var os: String }
        var ok: Bool; var token: String; var agent: Agent
    }

    /// Pair with an agent using the 6-digit console code. Returns a Computer.
    static func pair(host: String, port: Int, code: String, clientName: String) async throws -> Computer {
        guard let url = url("/pair", host: host, port: port) else { throw ClientError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"; req.timeoutInterval = 12
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["code": code, "clientName": clientName])
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw ClientError.decoding }
        guard http.statusCode == 200 else {
            throw ClientError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        let pr = try JSONDecoder().decode(PairResponse.self, from: data)
        return Computer(id: pr.agent.id, name: pr.agent.name, host: host, port: port,
                        os: pr.agent.os, token: pr.token)
    }

    /// Pair with a Bonjour-discovered agent without typing a one-time code.
    static func autoPair(host: String, port: Int, clientName: String) async throws -> Computer {
        guard let url = url("/pair/auto", host: host, port: port) else { throw ClientError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"; req.timeoutInterval = 12
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["clientName": clientName])
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw ClientError.decoding }
        guard http.statusCode == 200 else {
            throw ClientError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        let pr = try JSONDecoder().decode(PairResponse.self, from: data)
        return Computer(id: pr.agent.id, name: pr.agent.name, host: host, port: port,
                        os: pr.agent.os, token: pr.token)
    }

    struct TasksResponse: Codable { var tasks: [AgentTask] }
    func fetchTasks() async throws -> [AgentTask] {
        let data = try await request("/tasks")
        return try JSONDecoder().decode(TasksResponse.self, from: data).tasks
    }

    struct ExecuteResponse: Codable { var ok: Bool; var log: ExecutionLog }
    func execute(taskId: String, confirmed: Bool) async throws -> ExecutionLog {
        let data = try await request("/tasks/execute", method: "POST",
                                     body: ExecuteRequest(taskId: taskId, confirmed: confirmed))
        return try JSONDecoder().decode(ExecuteResponse.self, from: data).log
    }

    struct LogsResponse: Codable { var logs: [ExecutionLog] }
    func fetchLogs(limit: Int = 50) async throws -> [ExecutionLog] {
        let data = try await request("/logs?limit=\(limit)")
        return try JSONDecoder().decode(LogsResponse.self, from: data).logs
    }

    struct ApprovalsResponse: Codable { var approvals: [ApprovalRequest] }
    func fetchApprovals() async throws -> [ApprovalRequest] {
        let data = try await request("/approvals")
        return try JSONDecoder().decode(ApprovalsResponse.self, from: data).approvals
    }

    func registerPushToken(_ deviceToken: String) async throws {
        _ = try await request("/push/register", method: "POST",
                              body: ["deviceToken": deviceToken, "environment": "sandbox"])
    }

    func decideApproval(id: String, decision: String) async throws {
        _ = try await request("/approvals/\(id)/decision", method: "POST",
                              body: ["decision": decision])
    }
}

/// Type-erasing wrapper so `Encodable` values can be encoded directly.
private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { encodeFunc = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFunc(encoder) }
}
