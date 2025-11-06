import SwiftUI

struct TimelineConstants {
    static let rulerHeight: CGFloat = 30.0 // 目盛りの高さ
    static let trackHeaderWidth: CGFloat = 80.0 // トラックヘッダーの幅
    static let trackHeight: CGFloat = 50.0 // 1トラックの高さ
    static let clipHeight: CGFloat = 44.0 // クリップの高さ
    static let zoomLevel: Double = 50.0 // 1秒あたりのポイント数
    static let defaultDuration: TimeInterval = 300.0 // 5分
}

struct TimelineView: View {
    @Binding var project: Project
    @Binding var selectedClipID: UUID?
    @Binding var currentTime: TimeInterval
    
    let onAddPSDClip: (UUID, TimeInterval) -> Void
    let onMoveClip: (UUID, Int) -> Void
    
    private let zoomLevel: Double = TimelineConstants.zoomLevel

    private var timelineMinWidth: CGFloat {
        (TimelineConstants.defaultDuration * zoomLevel) + 1000.0
    }

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            ZStack(alignment: .leading) {
                
                // --- 1. トラック本体 (VStack) ---
                VStack(alignment: .leading, spacing: 2) {
                    
                    TimelineRulerView(
                        currentTime: $currentTime,
                        zoomLevel: zoomLevel,
                        minWidth: timelineMinWidth
                    )
                    .frame(height: TimelineConstants.rulerHeight)

                    ForEach(Array($project.tracks.enumerated()), id: \.element.id) { index, $track in
                        TrackView(
                            track: $track,
                            trackIndex: index,
                            selectedClipID: $selectedClipID,
                            currentTime: currentTime,
                            zoomLevel: zoomLevel,
                            minWidth: timelineMinWidth,
                            onAddPSDClip: onAddPSDClip,
                            onMoveClip: onMoveClip
                        )
                    }
                    
                    Spacer() // 下部の余白
                }
                .padding()
                
                // --- 2. 再生ヘッド (Playhead) ---
                PlayheadView(currentTime: $currentTime, zoomLevel: zoomLevel)
                    .padding(.leading, 80 + 16)
                
            }
        }
        .background(Color(nsColor: .underPageBackgroundColor))
    }
}

// タイムライン目盛り(ルーラー)
struct TimelineRulerView: View {
    @Binding var currentTime: TimeInterval
    let zoomLevel: Double
    let minWidth: CGFloat
    
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(Color.gray.opacity(0.5))
                    .frame(minWidth: minWidth)
                
                Text("0.0s") // ダミー
                    .padding(.leading, 80 + 16)
            }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let x = value.location.x - TimelineConstants.trackHeaderWidth - 16
                        let time = max(0, x / zoomLevel)
                        currentTime = time
                    }
            )
        }
    }
}


// 再生ヘッドのビュー
struct PlayheadView: View {
    @Binding var currentTime: TimeInterval
    let zoomLevel: Double
    
    var body: some View {
        Rectangle()
            .fill(Color.red)
            .frame(width: 2)
            .offset(x: currentTime * zoomLevel)
            .animation(.linear(duration: 0.05), value: currentTime)
    }
}


// タイムライン内の1トラックの表示
struct TrackView: View {
    @Binding var track: Track
    let trackIndex: Int
    @Binding var selectedClipID: UUID?
    let currentTime: TimeInterval
    let zoomLevel: Double
    let minWidth: CGFloat
    let onAddPSDClip: (UUID, TimeInterval) -> Void
    let onMoveClip: (UUID, Int) -> Void
    
    var body: some View {
        HStack(alignment: .center) {
            // トラックヘッダー
            Text(track.name)
                .font(.caption)
                .padding(4)
                .frame(width: TimelineConstants.trackHeaderWidth,
                       height: TimelineConstants.trackHeight)
                .background(Color.gray.opacity(0.3))
                .cornerRadius(4)
            
            // クリップを描画するレーン
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(Color.gray.opacity(0.1))
                    .frame(height: TimelineConstants.trackHeight)
                    .frame(minWidth: minWidth)
                
                ForEach($track.clips) { $clip in
                    ClipView(
                        clip: $clip,
                        trackIndex: trackIndex,
                        selectedClipID: $selectedClipID,
                        zoomLevel: zoomLevel,
                        onMoveClip: onMoveClip
                    )
                    // ベースとなるX位置（startTime）
                    .offset(x: clip.startTime * zoomLevel)
                }
            }
            .contextMenu {
                Button("新しい図形を追加") {
                    let newClip = Clip(
                        name: "新しい図形",
                        type: .shape,
                        startTime: currentTime,
                        duration: 3.0
                    )
                    track.clips.append(newClip)
                    selectedClipID = newClip.id
                }
                
                Button("新しいキャラクター(PSD)を追加") {
                    onAddPSDClip(track.id, currentTime)
                }
                
                Button("新しい音声を追加") {
                    // TODO: 音声ファイルを選択するダイログを開く
                }
            }
        }
    }
}

// タイムライン上の1クリップの表示
struct ClipView: View {
    @Binding var clip: Clip
    let trackIndex: Int
    @Binding var selectedClipID: UUID?
    let zoomLevel: Double
    let onMoveClip: (UUID, Int) -> Void
    
    // --- ▼ 修正点: XとYのオフセットを保持する (CGSize) ▼ ---
    @GestureState private var dragOffset: CGSize = .zero
    // --- ▲ ---
    
    @State private var originalStartTime: TimeInterval = -1.0

    var body: some View {
        Text(clip.name)
            .font(.caption)
            .padding(.horizontal, 4)
            .frame(width: clip.duration * zoomLevel,
                   height: TimelineConstants.clipHeight)
            .background(clip.displayColor.opacity(0.8))
            .foregroundColor(.white)
            .cornerRadius(4)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(selectedClipID == clip.id ? Color.yellow : Color.black.opacity(0.5),
                            lineWidth: selectedClipID == clip.id ? 2 : 1)
            )
            // --- ▼ 修正点: 視覚的なオフセットを dragOffset で制御 ▼ ---
            .offset(x: dragOffset.width, y: dragOffset.height)
            // --- ▲ ---
            .onTapGesture {
                selectedClipID = clip.id
            }
            .gesture(
                DragGesture()
                    // --- ▼ 修正点: onChanged でドラッグオフセットを更新 ▼ ---
                    .updating($dragOffset) { value, state, _ in
                        // ドラッグ中の視覚的な位置を更新
                        state = value.translation
                    }
                    // --- ▲ ---
                    .onChanged { value in
                        // --- ▼ 修正点: X方向のデータ更新を onChanged から onEnded に移動 ▼ ---
                        if originalStartTime == -1.0 {
                            originalStartTime = clip.startTime
                        }
                        // (onChanged では startTime を変更しない)
                        // --- ▲ ---
                    }
                    .onEnded { value in
                        
                        // --- 1. X方向（時間）の移動をデータに反映 ---
                        let timeOffset = value.translation.width / zoomLevel
                        let newStartTime = max(0, originalStartTime + timeOffset)
                        clip.startTime = newStartTime
                        
                        // --- 2. Y方向（トラック）の移動をデータに反映 ---
                        let yTranslation = value.translation.height
                        let trackMove = Int(round(yTranslation / TimelineConstants.trackHeight))
                        
                        if trackMove != 0 {
                            let newTrackIndex = trackIndex + trackMove
                            onMoveClip(clip.id, newTrackIndex)
                        }

                        // --- 3. ドラッグ終了時にリセット ---
                        originalStartTime = -1.0
                    }
            )
    }
}
