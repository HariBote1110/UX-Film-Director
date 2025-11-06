//
//  InspectorView.swift
//  UX Film Director
//
//  Created by Yuki on 2025/11/05.
//


import SwiftUI

struct InspectorView: View {
    @Binding var project: Project
    @Binding var selectedClipID: UUID?

    // 選択中のクリップをプロジェクトデータから検索
    private var selectedClip: Clip? {
        if let id = selectedClipID {
            // 全トラックの全クリップからIDが一致するものを探す
            return project.tracks.flatMap { $0.clips }.first { $0.id == id }
        }
        return nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("インスペクタ").font(.title2).padding(.bottom)
                
                if let clip = selectedClip {
                    // --- 選択中クリップの基本情報 ---
                    Text(clip.name).font(.headline)
                    Text("種類: \(clip.type.rawValue)")
                    Text(String(format: "開始: %.2f秒 / 長さ: %.2f秒", clip.startTime, clip.duration))
                    
                    // --- PSDToolKit風の機能 (U-02, U-03) ---
                    if clip.type == .psd {
                        Divider().padding(.vertical)
                        
                        Text("表情・レイヤー操作 (U-02)")
                            .font(.headline)
                        
                        Text("ここにPSDのレイヤーグループ（目、口、眉など）を一覧表示します。")
                            .font(.caption)
                            .foregroundColor(.gray)
                        
                        // ダミーの表情コントロール
                        VStack(alignment: .leading) {
                            Text("目").bold()
                            Picker("目", selection: .constant("デフォルト")) {
                                Text("デフォルト").tag("デフォルト")
                                Text("笑顔").tag("笑顔")
                                Text("ジト目").tag("ジト目")
                            }
                            
                            Text("口").bold()
                            Picker("口", selection: .constant("閉じる")) {
                                Text("閉じる").tag("閉じる")
                                Text("あ").tag("あ")
                                Text("い").tag("い")
                            }
                        }
                        .pickerStyle(MenuPickerStyle())
                        
                        Button("現在の位置にキーフレーム挿入 (U-03)") {
                            // TODO: タイムラインにキーフレームを打つ処理
                        }
                    }
                    
                } else {
                    Text("タイムライン上のクリップを選択してください。")
                        .foregroundColor(.gray)
                }
                
                Spacer()
            }
            .padding()
        }
    }
}