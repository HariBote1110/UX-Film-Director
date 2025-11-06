import SwiftUI
import Combine // 👈 修正点: この行を追加

@main
struct UX_Film_DirectorApp: App {
    
    // PSDパーサーのインスタンスをアプリで保持
    @StateObject private var parserManager = ParserManager()

    var body: some Scene {
        WindowGroup {
            // ContentViewにパーサーマネージャーを渡す
            ContentView()
                .environmentObject(parserManager)
                .frame(minWidth: 1100, minHeight: 600)
                // アプリ起動時にJSのセットアップを試みる
                .onAppear {
                    parserManager.setup()
                }
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("新規プロジェクト") { }
            }
            CommandGroup(replacing: .saveItem) {
                Button("保存") { }
            }
        }
    }
}

/// PSDParserのセットアップ状態を管理するクラス
@MainActor
class ParserManager: ObservableObject {
    @Published var psdParser = PSDParser()
    @Published var isReady = false
    @Published var setupError: String? = nil
    
    func setup() {
        guard !isReady else { return }
        
        psdParser.setupJSEnvironment { [weak self] error in
            if let error = error {
                print("!!! PSDパーサーの初期化に失敗: \(error.localizedDescription)")
                self?.setupError = error.localizedDescription
            } else {
                print("PSDパーサーの準備が完了しました。")
                self?.isReady = true
            }
        }
    }
}
