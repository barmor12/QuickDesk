import Foundation

// Runs the REAL iPhone client code (Models.swift + AgentClient.swift) against
// a live agent, end-to-end, on macOS — without needing Xcode/UIKit. This is a
// verification harness, not a shipping target.

let env = ProcessInfo.processInfo.environment
let host = env["H"] ?? "127.0.0.1"
let port = Int(env["P"] ?? "7420")!
let code = env["CODE"] ?? ""
let localToken = env["LOCAL"] ?? ""

func createApproval(token: String) async throws -> String {
    var req = URLRequest(url: URL(string: "http://\(host):\(port)/approvals")!)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.httpBody = try JSONSerialization.data(withJSONObject: [
        "source": "claude", "tool": "Bash", "title": "Run command", "summary": "echo hi",
    ])
    let (data, _) = try await URLSession.shared.data(for: req)
    let obj = try JSONSerialization.jsonObject(with: data) as! [String: Any]
    return (obj["approval"] as! [String: Any])["id"] as! String
}

func run() async {
    do {
        let h = try await AgentClient.health(host: host, port: port)
        print("✓ health: ok=\(h.ok) agent=\(h.agent.name) os=\(h.agent.os)")

        let computer = try await AgentClient.pair(host: host, port: port, code: code, clientName: "CLI Verify")
        print("✓ pair: token=\(computer.token.prefix(8))… id=\(computer.id.prefix(8))…")

        let client = AgentClient(computer: computer)
        let tasks = try await client.fetchTasks()
        print("✓ tasks: [\(tasks.map { $0.id }.joined(separator: ", "))]")

        let log = try await client.execute(taskId: "say-hello", confirmed: false)
        print("✓ execute say-hello: status=\(log.status.rawValue) output=\"\(log.output ?? "")\"")

        // Confirmation gating: lock-computer should fail without confirmed=true.
        do {
            _ = try await client.execute(taskId: "lock-computer", confirmed: false)
            print("✗ lock-computer ran WITHOUT confirmation (should have been blocked)")
            exit(1)
        } catch {
            print("✓ confirmation gating: lock-computer correctly rejected without confirm")
        }

        let approvalID = try await createApproval(token: localToken)
        try await client.decideApproval(id: approvalID, decision: "allow")
        print("✓ approval round-trip: created + allowed (\(approvalID.prefix(8))…)")

        print("\n✅ ALL REAL-CLIENT CHECKS PASSED against live agent")
    } catch {
        print("✗ FAILED: \(error)")
        exit(1)
    }
}

let sem = DispatchSemaphore(value: 0)
Task { await run(); sem.signal() }
sem.wait()
