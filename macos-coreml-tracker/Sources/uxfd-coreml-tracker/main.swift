import AVFoundation
import CoreVideo
import Foundation
import Vision

// MARK: - JSON types (stdin / stdout)

struct BoundingBoxDTO: Codable {
    var x: Double
    var y: Double
    var width: Double
    var height: Double
}

struct TrackInput: Codable {
    var videoPath: String
    var startSec: Double
    var endSec: Double
    var initialBoundingBox: BoundingBoxDTO
    /// If set (> 0), emit at most one sample per this many frames (tracking still runs every decoded frame).
    var frameStride: Int?
    /// When `frameStride` is nil and `targetFps` > 0, emit samples roughly spaced by 1/targetFps in media time.
    var targetFps: Double?
}

struct TrackSampleDTO: Codable {
    var tSec: Double
    var boundingBox: BoundingBoxDTO
}

struct TrackOutputSuccess: Codable {
    var ok: Bool = true
    var samples: [TrackSampleDTO]
}

struct TrackOutputError: Codable {
    var ok: Bool = false
    var error: String
}

// MARK: - Helpers

func writeStdoutLineEncodable<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    guard let data = try? encoder.encode(value),
          let line = String(data: data, encoding: .utf8)
    else {
        fputs("{\"ok\":false,\"error\":\"Failed to encode output\"}\n", stderr)
        return
    }
    print(line)
}

func fail(_ message: String) -> Never {
    writeStdoutLineEncodable(TrackOutputError(ok: false, error: message))
    exit(1)
}

func cgRect(from box: BoundingBoxDTO) -> CGRect {
    CGRect(
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height
    )
}

func dto(from rect: CGRect) -> BoundingBoxDTO {
    BoundingBoxDTO(
        x: Double(rect.origin.x),
        y: Double(rect.origin.y),
        width: Double(rect.size.width),
        height: Double(rect.size.height)
    )
}

// MARK: - Main

let inputData = FileHandle.standardInput.readDataToEndOfFile()
guard !inputData.isEmpty else {
    fail("stdin is empty; expected JSON TrackInput")
}

let decoder = JSONDecoder()
let input: TrackInput
do {
    input = try decoder.decode(TrackInput.self, from: inputData)
} catch {
    fail("Invalid input JSON: \(error.localizedDescription)")
}

guard input.endSec > input.startSec else {
    fail("endSec must be greater than startSec")
}

let path = input.videoPath
guard FileManager.default.fileExists(atPath: path) else {
    fail("video file not found at path: \(path)")
}

let url = URL(fileURLWithPath: path)
let asset = AVURLAsset(url: url)
let videoTracks = asset.tracks(withMediaType: .video)
guard let videoTrack = videoTracks.first else {
    fail("no video track in asset")
}

guard let reader = try? AVAssetReader(asset: asset) else {
    fail("AVAssetReader init failed")
}

let outputSettings: [String: Any] = [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
]
let output = AVAssetReaderTrackOutput(track: videoTrack, outputSettings: outputSettings)
output.alwaysCopiesSampleData = false

guard reader.canAdd(output) else {
    fail("cannot add track output to reader")
}
reader.add(output)

let durationSec = input.endSec - input.startSec
let timeRange = CMTimeRange(
    start: CMTime(seconds: input.startSec, preferredTimescale: 600),
    duration: CMTime(seconds: durationSec, preferredTimescale: 600)
)
reader.timeRange = timeRange

guard reader.startReading() else {
    fail("AVAssetReader failed to start: \(reader.error?.localizedDescription ?? "unknown")")
}

let initialRect = cgRect(from: input.initialBoundingBox)
let observation = VNDetectedObjectObservation(boundingBox: initialRect)

let stride = max(1, input.frameStride ?? 1)
let targetFps = input.targetFps ?? 0
let minEmitInterval: Double? = targetFps > 0 ? (1.0 / targetFps) : nil

var samples: [TrackSampleDTO] = []
var frameIndex = 0
var lastEmittedMediaSec: Double?

let sequenceHandler = VNSequenceRequestHandler()

let request = VNTrackObjectRequest(detectedObjectObservation: observation)

request.trackingLevel = .accurate

while reader.status == .reading {
    guard let sampleBuffer = output.copyNextSampleBuffer() else {
        break
    }
    defer { CMSampleBufferInvalidate(sampleBuffer) }

    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
        continue
    }

    let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    let mediaSec = CMTimeGetSeconds(presentationTime)

    do {
        try sequenceHandler.perform([request], on: pixelBuffer)
    } catch {
        fail("Vision perform failed at t=\(mediaSec): \(error.localizedDescription)")
    }

    guard let results = request.results as? [VNDetectedObjectObservation],
          let first = results.first
    else {
        frameIndex += 1
        continue
    }

    let box = first.boundingBox
    let shouldEmit: Bool
    if frameIndex % stride != 0 {
        shouldEmit = false
    } else if let interval = minEmitInterval {
        if let last = lastEmittedMediaSec {
            shouldEmit = (mediaSec - last) >= interval - 1e-6
        } else {
            shouldEmit = true
        }
    } else {
        shouldEmit = true
    }

    if shouldEmit {
        samples.append(TrackSampleDTO(tSec: mediaSec, boundingBox: dto(from: box)))
        lastEmittedMediaSec = mediaSec
    }

    frameIndex += 1
}

if samples.isEmpty, reader.status == .failed {
    fail("reader failed: \(reader.error?.localizedDescription ?? "unknown")")
}

writeStdoutLineEncodable(TrackOutputSuccess(samples: samples))
