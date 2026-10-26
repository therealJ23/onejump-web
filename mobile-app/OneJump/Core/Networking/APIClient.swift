import Foundation

extension Notification.Name {
    /// The server said "logged out" (401). The app shows the login screen.
    static let ojLoggedOut = Notification.Name("oj.loggedOut")
}

/// Talks to the OneJump server, the same JSON API the web app uses (see API.md).
///
/// Sessions use the `oj.sid` cookie, which URLSession keeps (and remembers between launches,
/// for 14 days of inactivity). Every request that changes data sends the CSRF token in the
/// `X-CSRF-Token` header. Keys for AI and voice stay on the server; the app never has them.
///
/// Screenshots and tests can run without a server: launch with `-ojFixture Fixtures` and the
/// answers come from JSON files in the app's Documents/Fixtures folder (see `Fixtures/`).
final class APIClient {
    static let shared = APIClient()

    /// The live server. For development: launch with `-oj.server http://127.0.0.1:3000`.
    var baseURL: URL {
        if let custom = UserDefaults.standard.string(forKey: "oj.server"), let url = URL(string: custom) { return url }
        return URL(string: "https://onejumpfit.com")!
    }

    private let session: URLSession
    private var csrfToken: String?

    init(session: URLSession = .shared) {
        self.session = session
    }

    struct APIError: LocalizedError {
        let status: Int
        let message: String
        var code: String?
        var errorDescription: String? { message }

        /// 401 means "logged out": show the login screen.
        var isLoggedOut: Bool { status == 401 }
        /// 403 with an upgrade code: the feature needs a higher plan.
        var isUpgrade: Bool { code == "upgrade" }
    }

    private struct ErrorBody: Decodable {
        let error: String?
        let code: String?
    }

    private struct CSRFBody: Decodable {
        let csrfToken: String
    }

    /// Any JSON answer whose contents the app doesn't need.
    struct Empty: Decodable {}

    /// The usual `{ ok, message }` answer to an action.
    struct OK: Decodable {
        var ok: Bool?
        var message: String?
    }

    // MARK: - Requests

    func get<T: Decodable>(_ path: String, as type: T.Type = T.self, timeout: TimeInterval = 30) async throws -> T {
        try decode(T.self, try await send("GET", path, json: nil, timeout: timeout))
    }

    /// POST with a JSON body (a dictionary of strings, numbers, booleans, arrays and dictionaries).
    func post<T: Decodable>(_ path: String, _ json: [String: Any] = [:], as type: T.Type = T.self, timeout: TimeInterval = 30) async throws -> T {
        try decode(T.self, try await send("POST", path, json: json, timeout: timeout))
    }

    func patch<T: Decodable>(_ path: String, _ json: [String: Any], as type: T.Type = T.self) async throws -> T {
        try decode(T.self, try await send("PATCH", path, json: json))
    }

    func put<T: Decodable>(_ path: String, _ json: [String: Any], as type: T.Type = T.self) async throws -> T {
        try decode(T.self, try await send("PUT", path, json: json))
    }

    func delete<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        try decode(T.self, try await send("DELETE", path, json: nil))
    }

    /// POST that returns raw bytes (audio). nil when the server answers 204 (no content).
    func postForData(_ path: String, _ json: [String: Any], timeout: TimeInterval = 9) async throws -> Data? {
        if Fixtures.isOn { return nil }
        let (data, status) = try await raw("POST", path, json: json, timeout: timeout, retryCSRF: true)
        return status == 204 || data.isEmpty ? nil : data
    }

    /// Sends one file (a photo or a video) as multipart form data. Videos can take a while.
    func upload<T: Decodable>(_ path: String, field: String, file: Data, filename: String, mimeType: String, fields: [String: String] = [:], as type: T.Type = T.self, timeout: TimeInterval = 180) async throws -> T {
        if Fixtures.isOn { return try decode(T.self, Fixtures.answer("POST", path)) }
        if csrfToken == nil { try await refreshCSRF() }
        let boundary = "OneJump-\(UUID().uuidString)"
        var body = Data()
        // Plain fields first (multer reads them before the file).
        for (name, value) in fields.sorted(by: { $0.key < $1.key }) {
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
        }
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"\(field)\"; filename=\"\(filename)\"\r\n".utf8))
        body.append(Data("Content-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(file)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))

        func attempt(retry: Bool) async throws -> Data {
            guard let url = URL(string: path, relativeTo: baseURL) else { throw APIError(status: 0, message: "Bad address.") }
            var request = URLRequest(url: url, timeoutInterval: timeout)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("OneJump-iOS", forHTTPHeaderField: "X-Client")
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            if let csrfToken { request.setValue(csrfToken, forHTTPHeaderField: "X-CSRF-Token") }
            let data: Data
            let response: URLResponse
            do {
                (data, response) = try await session.upload(for: request, from: body)
            } catch let error as URLError {
                throw APIError(status: 0, message: error.code == .timedOut ? "The upload took too long. Try a shorter video." : "Couldn’t reach OneJump. Try again.")
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if (200..<300).contains(status) { return data }
            let errorBody = try? JSONDecoder().decode(ErrorBody.self, from: data)
            if status == 403, errorBody?.code == "csrf", retry {
                try await refreshCSRF()
                return try await attempt(retry: false)
            }
            if status == 401 { await MainActor.run { NotificationCenter.default.post(name: .ojLoggedOut, object: nil) } }
            throw APIError(status: status, message: errorBody?.error ?? (status == 413 ? "That file is too large." : "The upload didn’t work. Try again."), code: errorBody?.code)
        }
        return try decode(T.self, try await attempt(retry: true))
    }

    // MARK: - Streamed answers (server-sent events)

    /// One event from a streamed answer: `type` ("delta", "reset", "say", "done", "error"),
    /// its text, and for "done" the full answer as JSON.
    struct StreamEvent: Sendable {
        let type: String
        var text: String?
        var message: String?
        var status: Int?
        var answer: Data?
    }

    /// POSTs JSON and hands back the server's events as they arrive (Ask Assist streams its
    /// answer this way, so it shows and speaks while it's still being written).
    func eventStream(_ path: String, _ json: [String: Any], timeout: TimeInterval = 60) -> AsyncThrowingStream<StreamEvent, Error> {
        let body = (try? JSONSerialization.data(withJSONObject: json)) ?? Data("{}".utf8)
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    try await self.streamEvents(path, body: body, timeout: timeout, retryCSRF: true) { continuation.yield($0) }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func streamEvents(_ path: String, body: Data, timeout: TimeInterval, retryCSRF: Bool, yield: (StreamEvent) -> Void) async throws {
        if csrfToken == nil { try await refreshCSRF() }
        guard let url = URL(string: path, relativeTo: baseURL) else { throw APIError(status: 0, message: "Bad address.") }
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = "POST"
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("OneJump-iOS", forHTTPHeaderField: "X-Client")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let csrfToken { request.setValue(csrfToken, forHTTPHeaderField: "X-CSRF-Token") }
        request.httpBody = body

        let bytes: URLSession.AsyncBytes
        let response: URLResponse
        do {
            (bytes, response) = try await session.bytes(for: request)
        } catch let error as URLError {
            throw APIError(status: 0, message: error.code == .notConnectedToInternet || error.code == .networkConnectionLost
                ? "You’re offline. Check your connection and try again."
                : error.code == .timedOut ? "The server took too long. Try again." : "Couldn’t reach OneJump. Try again.")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            var data = Data()
            for try await byte in bytes { data.append(byte); if data.count > 64_000 { break } }
            let errorBody = try? JSONDecoder().decode(ErrorBody.self, from: data)
            if status == 403, errorBody?.code == "csrf", retryCSRF {
                try await refreshCSRF()
                return try await streamEvents(path, body: body, timeout: timeout, retryCSRF: false, yield: yield)
            }
            if status == 401 { await MainActor.run { NotificationCenter.default.post(name: .ojLoggedOut, object: nil) } }
            throw APIError(status: status, message: errorBody?.error ?? (status >= 500 ? "Something went wrong on our side. Try again in a minute." : HTTPURLResponse.localizedString(forStatusCode: status)), code: errorBody?.code)
        }
        for try await line in bytes.lines {
            guard line.hasPrefix("data:") else { continue } // comments (": ping") and blank lines
            let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
            guard let data = payload.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = object["type"] as? String else { continue }
            var event = StreamEvent(type: type, text: object["text"] as? String, message: object["message"] as? String, status: object["status"] as? Int)
            if let answer = object["answer"] { event.answer = try? JSONSerialization.data(withJSONObject: answer) }
            yield(event)
        }
    }

    /// A full address for a path the server sent (signed file links start with "/files/").
    func absoluteURL(_ path: String) -> URL? {
        if path.hasPrefix("http://") || path.hasPrefix("https://") { return URL(string: path) }
        return URL(string: path, relativeTo: baseURL)?.absoluteURL
    }

    private func decode<T: Decodable>(_ type: T.Type, _ data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(T.self, from: data.isEmpty ? Data("{}".utf8) : data)
        } catch {
            #if DEBUG
            print("[api] decode \(T.self) failed:", error)
            #endif
            throw APIError(status: 0, message: "The server sent something the app didn’t understand. Update the app and try again.")
        }
    }

    private func send(_ method: String, _ path: String, json: [String: Any]?, timeout: TimeInterval = 30) async throws -> Data {
        if Fixtures.isOn { return Fixtures.answer(method, path) }
        return try await raw(method, path, json: json, timeout: timeout, retryCSRF: true).0
    }

    private func raw(_ method: String, _ path: String, json: [String: Any]?, timeout: TimeInterval, retryCSRF: Bool) async throws -> (Data, Int) {
        if method != "GET" && csrfToken == nil {
            try await refreshCSRF()
        }
        guard let url = URL(string: path, relativeTo: baseURL) else { throw APIError(status: 0, message: "Bad address.") }
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("OneJump-iOS", forHTTPHeaderField: "X-Client")
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        if method != "GET", let csrfToken {
            request.setValue(csrfToken, forHTTPHeaderField: "X-CSRF-Token")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError {
            throw APIError(status: 0, message: error.code == .notConnectedToInternet || error.code == .networkConnectionLost
                ? "You’re offline. Check your connection and try again."
                : error.code == .timedOut ? "The server took too long. Try again." : "Couldn’t reach OneJump. Try again.")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if (200..<300).contains(status) { return (data, status) }

        let errorBody = try? JSONDecoder().decode(ErrorBody.self, from: data)
        // A stale CSRF token: get a fresh one and try once more.
        if status == 403, errorBody?.code == "csrf", retryCSRF {
            try await refreshCSRF()
            return try await raw(method, path, json: json, timeout: timeout, retryCSRF: false)
        }
        if status == 401 && !path.hasPrefix("/api/auth/") {
            await MainActor.run { NotificationCenter.default.post(name: .ojLoggedOut, object: nil) }
        }
        let fallback = status >= 500 ? "Something went wrong on our side. Try again in a minute." : HTTPURLResponse.localizedString(forStatusCode: status)
        throw APIError(status: status, message: errorBody?.error ?? fallback, code: errorBody?.code)
    }

    private func refreshCSRF() async throws {
        guard let url = URL(string: "/api/auth/csrf", relativeTo: baseURL) else { return }
        do {
            let (data, _) = try await session.data(from: url)
            csrfToken = try JSONDecoder().decode(CSRFBody.self, from: data).csrfToken
        } catch {
            throw APIError(status: 0, message: "Couldn’t reach OneJump. Check your connection and try again.")
        }
    }

    /// Remembers a fresh CSRF token from a login response.
    func use(csrf token: String?) {
        if let token { csrfToken = token }
    }

    // MARK: - Logging in

    struct LoginResponse: Decodable {
        let ok: Bool?
        let twoFactor: Bool?
        let csrfToken: String?
    }

    struct Me: Decodable {
        struct User: Decodable { let id: String; let name: String; let email: String }
        struct Business: Decodable { let name: String; let slug: String?; let effectivePlan: String?; let trialDaysLeft: Int? }
        let user: User?
        let role: String?
        let business: Business?
        let csrfToken: String?

        /// Owners and coaches use the coach app.
        var isCoach: Bool { role == "OWNER" || role == "COACH" }
    }

    /// Coach login. Returns true when the two-step code is needed next.
    func logIn(email: String, password: String) async throws -> Bool {
        let r: LoginResponse = try await post("/api/auth/login", ["email": email, "password": password])
        use(csrf: r.csrfToken)
        return r.twoFactor == true
    }

    /// The 6-digit code from the coach's authenticator app.
    func logIn(code: String) async throws {
        let r: LoginResponse = try await post("/api/auth/login/2fa", ["code": code])
        use(csrf: r.csrfToken)
    }

    /// Who is logged in (nil user = nobody).
    func me() async throws -> Me {
        let me: Me = try await get("/api/auth/me")
        use(csrf: me.csrfToken)
        return me
    }

    func logOut() async {
        let _: Empty? = try? await post("/api/auth/logout")
        csrfToken = nil
        if let cookies = HTTPCookieStorage.shared.cookies(for: baseURL) {
            for cookie in cookies { HTTPCookieStorage.shared.deleteCookie(cookie) }
        }
    }
}

// MARK: - Fixtures (screenshots and tests without a server)

/// Answers from JSON files instead of the server. The files are made by the server's tests
/// from the sample business, so the app is checked against the real response shapes.
enum Fixtures {
    /// The folder, if the app was launched with `-ojFixture <folder>`. A relative folder is
    /// looked up in the app's Documents folder.
    static let folder: URL? = {
        guard let path = UserDefaults.standard.string(forKey: "ojFixture"), !path.isEmpty else { return nil }
        if path.hasPrefix("/") { return URL(fileURLWithPath: path) }
        return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?.appendingPathComponent(path)
    }()

    static var isOn: Bool { folder != nil }

    private static func file(_ name: String) -> Data {
        guard let url = folder?.appendingPathComponent(name + ".json"), let data = try? Data(contentsOf: url) else { return Data("{}".utf8) }
        return data
    }

    static func answer(_ method: String, _ path: String) -> Data {
        let p = path.components(separatedBy: "?").first ?? path
        switch true {
        case p == "/api/mobile/coach": return file("snapshot")
        case p.hasPrefix("/api/mobile/coach/clients/"): return file("detail")
        case p.hasPrefix("/api/mobile/coach/threads/"): return file("thread")
        case p.hasPrefix("/api/mobile/coach/checkins/"): return file("checkin")
        case p == "/api/briefing/today": return file("briefing")
        case p == "/api/assist/ask": return file("ask")
        case p.hasSuffix("/nutrition-plan/assist"): return file("nplan")
        case p == "/api/auth/me": return Data(#"{"user":{"id":"fixture","name":"Fixture Coach","email":"coach@example.com"},"role":"OWNER"}"#.utf8)
        default: return Data(#"{"ok":true}"#.utf8)
        }
    }
}
