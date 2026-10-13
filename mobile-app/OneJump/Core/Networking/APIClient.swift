import Foundation

/// Talks to the OneJump server, the same JSON API the web app uses (see API.md).
///
/// The preview screens run on sample data. When you connect a screen to the server,
/// call this instead, for example:
///
///     let today: TodayResponse = try await APIClient.shared.get("/api/me/today")
///
/// Sessions use the `oj.sid` cookie (URLSession keeps it for you). Every request that
/// changes data sends the CSRF token in the `X-CSRF-Token` header.
final class APIClient {
    static let shared = APIClient()

    /// The live server. Use http://localhost:3000 when running the web app on your Mac.
    var baseURL = URL(string: "https://onejumpfit.com")!

    private let session: URLSession
    private var csrfToken: String?

    init(session: URLSession = .shared) {
        self.session = session
    }

    struct APIError: LocalizedError {
        let status: Int
        let message: String
        var errorDescription: String? { message }

        /// 401 means "logged out": show the login screen.
        var isLoggedOut: Bool { status == 401 }
    }

    private struct ErrorBody: Decodable {
        let error: String?
        let code: String?
    }

    private struct CSRFBody: Decodable {
        let csrfToken: String
    }

    private struct Empty: Encodable {}

    // MARK: - Requests

    func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        try await request("GET", path, body: Optional<Empty>.none, retryCSRF: true)
    }

    func post<Body: Encodable, T: Decodable>(_ path: String, body: Body, as type: T.Type = T.self) async throws -> T {
        try await request("POST", path, body: body, retryCSRF: true)
    }

    func delete<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        try await request("DELETE", path, body: Optional<Empty>.none, retryCSRF: true)
    }

    private func request<Body: Encodable, T: Decodable>(_ method: String, _ path: String, body: Body?, retryCSRF: Bool) async throws -> T {
        if method != "GET" && csrfToken == nil {
            try await refreshCSRF()
        }
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        if method != "GET", let csrfToken {
            request.setValue(csrfToken, forHTTPHeaderField: "X-CSRF-Token")
        }

        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        if (200..<300).contains(status) {
            return try JSONDecoder().decode(T.self, from: data)
        }

        let errorBody = try? JSONDecoder().decode(ErrorBody.self, from: data)
        // A stale CSRF token: get a fresh one and try once more.
        if status == 403, errorBody?.code == "csrf", retryCSRF {
            try await refreshCSRF()
            return try await self.request(method, path, body: body, retryCSRF: false)
        }
        throw APIError(status: status, message: errorBody?.error ?? HTTPURLResponse.localizedString(forStatusCode: status))
    }

    private func refreshCSRF() async throws {
        let (data, _) = try await session.data(from: baseURL.appendingPathComponent("/api/auth/csrf"))
        csrfToken = try JSONDecoder().decode(CSRFBody.self, from: data).csrfToken
    }

    // MARK: - Login (clients use email links, no passwords)

    struct OK: Decodable {
        let ok: Bool?
    }

    struct MagicLoginResponse: Decodable {
        let ok: Bool?
        let csrfToken: String?
    }

    /// Emails the client a login link.
    func requestMagicLink(email: String) async throws {
        let _: OK = try await post("/api/auth/magic-link", body: ["email": email])
    }

    /// Finishes login when the app opens the link from the email.
    func signIn(withMagicToken token: String) async throws {
        let response: MagicLoginResponse = try await post("/api/auth/magic", body: ["token": token])
        if let fresh = response.csrfToken { csrfToken = fresh }
    }

    func logOut() async throws {
        let _: OK = try await post("/api/auth/logout", body: [String: String]())
        csrfToken = nil
    }
}
