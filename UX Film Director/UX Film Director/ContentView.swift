import SwiftUI
import UniformTypeIdentifiers
import Combine

struct ContentView: View {
    @State private var project = Project.createSampleProject()
    @State private var selectedClipID: UUID?
    @State private var currentTime: TimeInterval = 0.0
    
    @EnvironmentObject private var parserManager: ParserManager
    private var labParser = LabParser()
    
    @State private var psdParseLog: String = ""
    @State private var labParseLog: String = ""

    var body: some View {
        NavigationSplitView {
            List {
                Text("メディアプール").font(.headline)
                
                Button("PSDをインポート (テスト用)") {
                    testImportPSD()
                }
                .disabled(!parserManager.isReady)
                
                Button("音声と.labをインポート...") {
                    testLoadLab()
                }
                
                if !parserManager.isReady {
                    if let errorMsg = parserManager.setupError {
                        Text("PSDパーサーエラー: \(errorMsg)")
                            .foregroundColor(.red)
                    } else {
                        Text("PSDパーサーを初期化中...")
                            .foregroundColor(.gray)
                    }
                }
                
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
                PreviewView(project: $project, currentTime: $currentTime)
                    .frame(minHeight: 300, maxHeight: .infinity)
                Divider()
                TimelineView(
                    project: $project,
                    selectedClipID: $selectedClipID,
                    currentTime: $currentTime,
                    onAddPSDClip: addPSDClip,
                    onMoveClip: moveClip
                )
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
    
    // ---
    // MARK: - データ操作関数
    // ---

    /// タイムラインの右クリックから呼び出されるPSD追加関数
    private func addPSDClip(to trackID: UUID, at startTime: TimeInterval) {
        // ... (この関数は変更なし) ...
        guard parserManager.isReady else { return }
        
        let openPanel = NSOpenPanel()
        openPanel.title = "PSDファイルを選択"
        openPanel.canChooseFiles = true
        openPanel.canChooseDirectories = false
        openPanel.allowsMultipleSelection = false
        openPanel.allowedContentTypes = [UTType("com.adobe.photoshop-image")!]
        
        if openPanel.runModal() == .OK, let url = openPanel.url {
            psdParseLog = "[\(url.lastPathComponent)] の解析を開始..."
            
            let result = parserManager.psdParser.parse(url: url)
            
            switch result {
            case .success(let layers):
                psdParseLog = "パース成功: レイヤー\(layers.count)件"
                logLayers(layers, indent: "")

                let newClip = Clip(
                    name: url.lastPathComponent,
                    type: .psd,
                    startTime: max(0, startTime),
                    duration: 10.0,
                    psdLayerStructure: layers
                )
                
                if let trackIndex = project.tracks.firstIndex(where: { $0.id == trackID }) {
                    project.tracks[trackIndex].clips.append(newClip)
                    selectedClipID = newClip.id
                }

            case .failure(let error):
                psdParseLog = "パース失敗:\n\(error.localizedDescription)"
            }
        }
    }
    
    /// クリップを別トラックにドラッグ移動させる関数
    private func moveClip(clipID: UUID, to newTrackIndex: Int) {
        guard newTrackIndex >= 0 && newTrackIndex < project.tracks.count else {
            return
        }
        
        var clipToMove: Clip?
        var fromTrackIndex: Int?

        for (index, track) in project.tracks.enumerated() {
            if let clipIndex = track.clips.firstIndex(where: { $0.id == clipID }) {
                clipToMove = project.tracks[index].clips.remove(at: clipIndex)
                fromTrackIndex = index
                break
            }
        }

        // --- ▼ 修正点: (警告の修正) 'var clip' -> 'let clip' ▼ ---
        if let clip = clipToMove, let fromIndex = fromTrackIndex, fromIndex != newTrackIndex {
            project.tracks[newTrackIndex].clips.append(clip)
            print("クリップ '\(clip.name)' を レイヤー \(fromIndex + 1) -> \(newTrackIndex + 1) に移動しました。")
        } else if let clip = clipToMove, let fromIndex = fromTrackIndex {
            // --- ▼ 修正点: (警告の修正) 'var clip' -> 'let clip' ▼ ---
             project.tracks[fromIndex].clips.append(clip)
        }
        // --- ▲ ---
    }

    
    /// (テスト用) PSDをインポートする
    private func testImportPSD() {
        // ... (この関数は変更なし) ...
        let openPanel = NSOpenPanel()
        openPanel.title = "テストするPSDファイルを選択"
        openPanel.canChooseFiles = true
        openPanel.canChooseDirectories = false
        openPanel.allowsMultipleSelection = false
        openPanel.allowedContentTypes = [UTType("com.adobe.photoshop-image")!]
        
        if openPanel.runModal() == .OK, let url = openPanel.url {
            psdParseLog = "[\(url.lastPathComponent)] の解析を開始..."
            let result = parserManager.psdParser.parse(url: url)
            
            switch result {
            case .success(let layers):
                psdParseLog = "パース成功: レイヤー\(layers.count)件\n"
                logLayers(layers, indent: "")
                psdParseLog += "\n-> (インポートテスト完了)"
            case .failure(let error):
                psdParseLog = "パース失敗:\n\(error.localizedDescription)"
            }
        }
    }
    
    private func logLayers(_ layers: [LayerInfo], indent: String) {
        // ... (この関数は変更なし) ...
        for layer in layers {
            let logLine = "\(indent)[\(layer.isGroup ? "G" : "L")] \(layer.name) (\(layer.blendMode), \(layer.opacity)) \(layer.isVisible ? "" : "(非表示)")"
            print(logLine)
            if indent.count < 5 {
                psdParseLog += logLine + "\n"
            }
            logLayers(layer.children, indent: indent + "  ")
        }
    }
    
    /// .labファイルの読み込みをテストする
    private func testLoadLab() {
        // ... (この関数は変更なし) ...
        let openPanel = NSOpenPanel()
        openPanel.title = "テストする.labファイルを選択"
        openPanel.canChooseFiles = true
        openPanel.canChooseDirectories = false
        openPanel.allowsMultipleSelection = false
        openPanel.allowedContentTypes = [UTType.text]
        
        if openPanel.runModal() == .OK, let url = openPanel.url {
            labParseLog = "[\(url.lastPathComponent)] の解析を開始..."
            do {
                let fileContent = try String(contentsOf: url, encoding: .utf8)
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

