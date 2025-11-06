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
    private var selectedClip: Binding<Clip>? {
        guard let id = selectedClipID else { return nil }
        
        for (tIndex, track) in project.tracks.enumerated() {
            for (cIndex, clip) in track.clips.enumerated() {
                if clip.id == id {
                    return $project.tracks[tIndex].clips[cIndex]
                }
            }
        }
        return nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("インスペクタ").font(.title2).padding(.bottom)
                
                // $selectedClip (Binding<Clip>) を取得
                if let $clip = selectedClip {
                    let clip = $clip.wrappedValue // 読み取り用の値
                    
                    // --- 選択中クリップの基本情報 ---
                    Text(clip.name).font(.headline)
                    Text("種類: \(clip.type.rawValue)")
                    Text(String(format: "開始: %.2f秒 / 長さ: %.2f秒", clip.startTime, clip.duration))
                    
                    Divider().padding(.vertical)

                    // --- クリップの型に応じてインスペクタの内容を変更 ---
                    
                    switch clip.type {
                        
                    case .shape:
                        Text("図形の設定")
                            .font(.headline)
                        
                        // $clip.shapeColor (Binding<Color>) を ColorPicker に渡す
                        ColorPicker("塗りつぶしの色", selection: $clip.shapeColor)

                    case .psd:
                        Text("表情・レイヤー操作 (U-02)")
                            .font(.headline)
                        
                        // $clip.psdLayerStructure は Binding<[LayerInfo]?> 型
                        
                        // 1. 実際に値 (配列) が存在するかを .wrappedValue で確認
                        if $clip.wrappedValue.psdLayerStructure != nil {
                            
                            // 2. 非オプショナル Binding<[LayerInfo]> を作成
                            let layersBinding = Binding(
                                get: { $clip.wrappedValue.psdLayerStructure! },
                                set: { $clip.wrappedValue.psdLayerStructure = $0 }
                            )
                            
                            // 3. 'layersBinding' を ForEach に渡す
                            ForEach(layersBinding) { $layer in
                                RecursiveLayerView(layerBinding: $layer)
                            }
                            .padding(.leading, 8)

                        } else {
                            Text("PSDレイヤー情報が読み込まれていません。\n(メディアプールからPSDを再インポートしてください)")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                        
                    case .audio, .video:
                        Text("詳細設定はありません。")
                            .foregroundColor(.gray)
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


// ---
// MARK: - レイヤーを再帰的に表示するためのビュー
// ---

/// レイヤー構造を再帰的に表示・編集するためのビュー
struct RecursiveLayerView: View {
    @Binding var layer: LayerInfo

    // PSDToolKit風の排他グループ（例: "目", "口"）かどうかを判定
    private var isExclusiveGroup: Bool {
        layer.isGroup &&
        !layer.children.isEmpty &&
        layer.children.allSatisfy { $0.name.starts(with: "*") }
    }

    // Picker で選択中のレイヤーIDを保持（排他グループ用）
    @State private var selectedChildID: UUID?
    
    init(layerBinding: Binding<LayerInfo>) {
        self._layer = layerBinding
        let initialLayer = layerBinding.wrappedValue
        
        // もしこれが排他グループなら、
        // 現在表示されている子レイヤーのIDを Picker の初期値に設定
        if initialLayer.isGroup &&
           !initialLayer.children.isEmpty &&
           initialLayer.children.allSatisfy({ $0.name.starts(with: "*") })
        {
            let visibleChildID = initialLayer.children.first(where: { $0.isVisible })?.id
            self._selectedChildID = State(initialValue: visibleChildID)
        }
    }

    var body: some View {
        
        if isExclusiveGroup {
            // --- 1. 排他グループ (Pickerで表示) ---
            Picker(layer.name, selection: $selectedChildID) {
                ForEach($layer.children) { $child in
                    Text(child.name).tag(child.id as UUID?)
                }
            }
            .pickerStyle(MenuPickerStyle())
            // (これが "onChange(of:perform:)' was deprecated" 警告の修正版)
            .onChange(of: selectedChildID) { newValue in
                // Picker で選択が変更されたら、子の isVisible を更新する
                for i in layer.children.indices {
                    layer.children[i].isVisible = (layer.children[i].id == newValue)
                }
            }
            
        } else if layer.isGroup {
            // --- 2. 通常のグループ (DisclosureGroup で表示) ---
            DisclosureGroup(
                isExpanded: $layer.isVisible, // グループの開閉状態を isVisible と連動
                content: {
                    ForEach($layer.children) { $child in
                        RecursiveLayerView(layerBinding: $child)
                    }
                    .padding(.leading, 12)
                },
                label: {
                    Text(layer.name)
                        .fontWeight(.bold)
                }
            )
            
        } else {
            // --- 3. 通常のレイヤー (Toggleで表示) ---
            Toggle(isOn: $layer.isVisible) {
                Text(layer.name)
            }
            .disabled(layer.name.starts(with: "*"))
        }
    }
}
