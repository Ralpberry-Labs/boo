// Boo for macOS: a native window around the local Boo server.
// On launch it starts Resources/app/boot.py (bundled Python, models and Ollama), waits for "BOO_READY <port>",
// then shows the page. Quitting stops the whole process group.
import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var web: WKWebView!
    private var server: Process?
    private var log: FileHandle?
    private var quitting = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = self
        web.setValue(false, forKey: "drawsBackground")

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 860),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "Boo"
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(srgbRed: 0.043, green: 0.051, blue: 0.071, alpha: 1)
        window.minSize = NSSize(width: 860, height: 620)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("BooMain")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        web.loadHTMLString(Self.page("Waking up the models…", "The first start takes a little while."), baseURL: nil)
        startServer()
    }

    private func startServer() {
        guard let res = Bundle.main.resourceURL else { return }
        let logURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Boo.log")
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        log = try? FileHandle(forWritingTo: logURL)

        let p = Process()
        p.executableURL = res.appendingPathComponent("python/bin/python3")
        p.arguments = ["-s", "-u", res.appendingPathComponent("app/boot.py").path]
        p.currentDirectoryURL = res.appendingPathComponent("app")
        p.environment = [
            "HOME": NSHomeDirectory(), "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
            "BOO_RESOURCES": res.path, "BOO_PARENT_PID": String(getpid()),
        ]
        let out = Pipe()
        p.standardOutput = out
        p.standardError = log
        out.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let self else { return }
            self.log?.write(data)
            for line in String(decoding: data, as: UTF8.self).split(separator: "\n") where line.hasPrefix("BOO_READY ") {
                guard let url = URL(string: "http://127.0.0.1:\(line.dropFirst("BOO_READY ".count))/") else { continue }
                DispatchQueue.main.async { self.web.load(URLRequest(url: url)) }
            }
        }
        p.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                guard let self, !self.quitting else { return }
                self.web.loadHTMLString(Self.page("Boo stopped.",
                    "Details are in ~/Library/Logs/Boo.log. Quit and open it again to retry."), baseURL: nil)
            }
        }
        do {
            try p.run()
            server = p
        } catch {
            web.loadHTMLString(Self.page("Couldn't start Boo.", error.localizedDescription), baseURL: nil)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        quitting = true
        if let p = server, p.isRunning {
            kill(-p.processIdentifier, SIGTERM) // boot.py leads its own process group, Ollama included
            p.terminate()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // The page asks for the microphone; allow it only for our own local server.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host == "127.0.0.1" ? .grant : .deny)
    }

    private func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Boo", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Boo", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit Boo", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit

        let windowItem = NSMenuItem(); main.addItem(windowItem)
        let win = NSMenu(title: "Window")
        win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowItem.submenu = win
        NSApp.windowsMenu = win
        NSApp.mainMenu = main
    }

    private static func page(_ title: String, _ detail: String) -> String {
        """
        <html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
          background:#0b0d12;color:#e8ebf2;font:600 22px -apple-system,system-ui;gap:14px">
        <div style="display:flex;gap:10px">\((0..<5).map { "<i style='width:12px;height:12px;border-radius:6px;background:#7cc4ff;animation:p 1.2s \(Double($0) * 0.15)s infinite'></i>" }.joined())</div>
        <div>\(title)</div><div style="font-size:14px;font-weight:400;color:#8a93a6">\(detail)</div>
        <style>@keyframes p{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1.1)}}</style>
        </body></html>
        """
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
