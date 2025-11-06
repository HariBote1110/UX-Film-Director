import SwiftUI

struct TimelineView: View {
    @Binding var project: Project
    @Binding var selectedClipID: UUID?
    
    private let zoomLevel: Double = 50.0 // 1秒を50ポイントとして描画するダミーのズームレベル

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            VStack(alignment: .leading, spacing: 2) {
                // TODO: 時間軸の目盛りを描画する
                
                ForEach($project.tracks) { $track in
                    TrackView(
                        track: $track,
                        selectedClipID: $selectedClipID,
                        zoomLevel: zoomLevel
                    )
                }
                
                Spacer() // 下部の余白
            }
            .padding()
        }
        // 🔽 --- 修正点: 'controlDarkShadowColor' を 'underPageBackgroundColor' に変更 ---
        .background(Color(nsColor: .underPageBackgroundColor))
        // --- ▲ ---
    }
}

// タイムライン内の1トラックの表示
struct TrackView: View {
    @Binding var track: Track
    @Binding var selectedClipID: UUID?
    let zoomLevel: Double
    
    var body: some View {
        HStack(alignment: .center) {
            // トラックヘッダー
            Text(track.name)
                .font(.caption)
                .padding(4)
                .frame(width: 80, height: 50)
                .background(Color.gray.opacity(0.3))
                .cornerRadius(4)
            
            // クリップを描画するレーン (ZStackで重なりを表現)
            ZStack(alignment: .leading) {
                // トラックの背景（空）
                Rectangle()
                    .fill(Color.gray.opacity(0.1))
                    .frame(height: 50)
                
                // トラック内のクリップを時間順に配置
                ForEach(track.clips) { clip in
                    ClipView(clip: clip)
                        // startTime と zoomLevel に基づいてX位置を計算
                        .offset(x: clip.startTime * zoomLevel)
                        .onTapGesture {
                            selectedClipID = clip.id // クリックで選択
                        }
                }
            }
        }
    }
}

// タイムライン上の1クリップの表示
struct ClipView: View {
    let clip: Clip
    private let zoomLevel: Double = 50.0 // TrackViewと合わせる
    
    var body: some View {
        Text(clip.name)
            .font(.caption)
            .padding(.horizontal, 4)
            .frame(width: clip.duration * zoomLevel, height: 44)
            .background(clip.displayColor.opacity(0.8))
            .foregroundColor(.white)
            .cornerRadius(4)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(Color.black.opacity(0.5), lineWidth: 1)
            )
    }
}
