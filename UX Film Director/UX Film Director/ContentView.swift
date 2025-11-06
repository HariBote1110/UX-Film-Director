import SwiftUI
import UniformTypeIdentifiers
import Combine // 👈 修正点: この行を追加

struct ContentView: View {
    @State private var project = Project.createSampleProject()
    @State private var selectedClipID: UUID?
    
    // --- ▼ ParserManager を環境から受け取る ▼ ---
    @EnvironmentObject private var parserManager: ParserManager
    // --- ▲ ---
    
    private var labParser = LabParser()
    
    // --- ▼ テスト結果表示用 ▼ ---
    @State private var psdParseLog: String = ""
    @State private var labParseLog: String = ""
    // --- ▲ ---

    var body: some View {
        NavigationSplitView {
            List {
                Text("メディアプール").font(.headline)
                
                Button("PSDをインポート...") {
                    testLoadPSD()
                }
                // --- ▼ パーサーが準備OKになるまでボタンを無効化 ▼ ---
                .disabled(!parserManager.isReady)
                
                Button("音声と.labをインポート...") {
                    testLoadLab()
                }
                
                // --- ▼ エラーログ表示 ▼ ---
                if !parserManager.isReady {
                    if let errorMsg = parserManager.setupError {
                        Text("PSDパーサーエラー: \(errorMsg)")
                            .foregroundColor(.red)
                    } else {
                        Text("PSDパーサーを初期化中...")
                            .foregroundColor(.gray)
                    }
                }
                
                // --- ▼ テスト結果ログ ▼ ---
                if !psdParseLog.isEmpty {
                    Text("PSDログ:\n\(psdParseLog)").font(.caption).foregroundColor(.gray)
                }
                if !labParseLog.isEmpty {
                    Text("Labログ:\n\(labParseLog)").font(.caption).foregroundColor(.gray)
                }
                
            }
            .listStyle(SidebarListStyle())
            .frame(minWidth: 180, maxWidth: 300)
            
        } content: {
            VStack(spacing: 0) {
                PreviewView(project: $project)
                    .frame(minHeight: 300, maxHeight: .infinity)
                Divider()
                TimelineView(project: $project, selectedClipID: $selectedClipID)
                    .frame(minHeight: 200, idealHeight: 300, maxHeight: 400)
            }
            .frame(minWidth: 500, maxWidth: .infinity)

        } detail: {
            InspectorView(project: $project, selectedClipID: $selectedClipID)
                .frame(minWidth: 250, maxWidth: 400)
                .background(Color(nsColor: .controlBackgroundColor))
        }
        .navigationTitle(project.name)
    }
    
    // --- ▼ テスト用の関数をここに追加 ▼ ---
    
    /// PSDファイルの読み込みをテストする
    private func testLoadPSD() {
        let openPanel = NSOpenPanel()
        openPanel.title = "テストするPSDファイルを選択"
        openPanel.canChooseFiles = true
        openPanel.canChooseDirectories = false
        openPanel.allowsMultipleSelection = false
        // PSDファイル (com.adobe.photoshop-image) のみ許可
        openPanel.allowedContentTypes = [UTType("com.adobe.photoshop-image")!]
        
        if openPanel.runModal() == .OK {
            if let url = openPanel.url {
                psdParseLog = "[\(url.lastPathComponent)] の解析を開始..."
                
                // 新しいJSパーサーを呼び出す (同期的に結果が返る)
                let result = parserManager.psdParser.parse(url: url)
                
                switch result {
                case .success(let layers):
                    print("--- ✅ PSDパース結果 (JS) ---")
                    psdParseLog = "パース成功: レイヤー\(layers.count)件\n"
                    // 再帰的にレイヤー名を出力
                    logLayers(layers, indent: "")
                    print("------------------------------")
                    
                case .failure(let error):
                    print("--- ❌ PSDパース失敗 (JS) ---")
                    psdParseLog = "パース失敗:\n\(error.localizedDescription)"
                    print(error.localizedDescription)
                }
            }
        }
    }
    
    // 再帰的にレイヤー情報をコンソールとUIに出力するヘルパー
    private func logLayers(_ layers: [PSDParser.LayerInfo], indent: String) {
        for layer in layers {
            let logLine = "\(indent)[\(layer.isGroup ? "G" : "L")] \(layer.name) (\(layer.blendMode), \(layer.opacity)) \(layer.isVisible ? "" : "(非表示)")"
            print(logLine)
            // UIには表示しすぎないよう制限
            if indent.count < 5 {
                psdParseLog += logLine + "\n"
            }
            logLayers(layer.children, indent: indent + "  ")
        }
    }
    
    /// .labファイルの読み込みをテストする
    private func testLoadLab() {
        let openPanel = NSOpenPanel()
        openPanel.title = "テストする.labファイルを選択"
        openPanel.canChooseFiles = true
        openPanel.canChooseDirectories = false
        openPanel.allowsMultipleSelection = false
        // .lab は実質テキストファイル
        openPanel.allowedContentTypes = [UTType.text]
        
        if openPanel.runModal() == .OK {
            if let url = openPanel.url {
                labParseLog = "[\(url.lastPathComponent)] の解析を開始..."
                do {
                    // .labはファイルパス(URL)ではなく、中身の文字列(String)を渡す
                    // (文字コードは .utf8 で決め打ち。もし文字化けするなら .shiftJIS などに変更)
                    let fileContent = try String(contentsOf: url, encoding: .utf8)
                    
                    // 実際にパーサーを呼び出す
                    let entries = labParser.parse(content: fileContent)
                    
                    labParseLog = "パース成功 (先頭5件):\n"
                    for entry in entries.prefix(5) {
                        labParseLog += String(format: "%.3f - %.3f: %@\n",
                                     entry.startTime,
                                     entry.endTime,
                                     entry.phoneme)
                    }
                    labParseLog += "... (全\(entries.count)件)"
                    
                } catch {
                    labParseLog = "Lab読み込み失敗: \(error.localizedDescription)"
                }
            }
        }
    }
}
