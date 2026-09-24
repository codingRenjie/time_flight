import AVFoundation
import Foundation

// 把竖屏 HEVC 压成网页可播的 H.264，去掉音轨。
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let bitrate = CommandLine.arguments.count > 3 ? Int(CommandLine.arguments[3]) ?? 1_800_000 : 1_800_000

try? FileManager.default.removeItem(at: output)

let asset = AVURLAsset(url: input)
let sema = DispatchSemaphore(value: 0)
var loadedTrack: AVAssetTrack?
var loadError: Error?
asset.loadTracks(withMediaType: .video) { tracks, error in
  loadedTrack = tracks?.first
  loadError = error
  sema.signal()
}
sema.wait()
if let loadError { fputs("\(loadError)\n", stderr); exit(1) }
guard let track = loadedTrack else { fputs("no video track\n", stderr); exit(1) }

let natural = track.naturalSize
let transform = track.preferredTransform
let display = natural.applying(transform)
fputs(
  String(
    format: "natural %.0fx%.0f display %.0fx%.0f\n",
    natural.width, natural.height, abs(display.width), abs(display.height)
  ),
  stderr
)

let reader = try AVAssetReader(asset: asset)
let readerOutput = AVAssetReaderTrackOutput(track: track, outputSettings: [
  kCVPixelBufferPixelFormatTypeKey as String: NSNumber(value: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange),
])
readerOutput.alwaysCopiesSampleData = false
guard reader.canAdd(readerOutput) else { fputs("cannot add reader output\n", stderr); exit(1) }
reader.add(readerOutput)

let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true
let width = Int(natural.width.rounded())
let height = Int(natural.height.rounded())
let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: bitrate,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoMaxKeyFrameIntervalKey: 60,
  ],
])
writerInput.transform = transform
writerInput.expectsMediaDataInRealTime = false
guard writer.canAdd(writerInput) else { fputs("cannot add writer input\n", stderr); exit(1) }
writer.add(writerInput)

guard reader.startReading() else { fputs("reader \(String(describing: reader.error))\n", stderr); exit(1) }
guard writer.startWriting() else { fputs("writer \(String(describing: writer.error))\n", stderr); exit(1) }
writer.startSession(atSourceTime: .zero)

let queue = DispatchQueue(label: "encode-bg")
let done = DispatchSemaphore(value: 0)
writerInput.requestMediaDataWhenReady(on: queue) {
  while writerInput.isReadyForMoreMediaData {
    if let sample = readerOutput.copyNextSampleBuffer() {
      if !writerInput.append(sample) {
        reader.cancelReading()
        writerInput.markAsFinished()
        done.signal()
        return
      }
    } else {
      writerInput.markAsFinished()
      writer.finishWriting { done.signal() }
      return
    }
  }
}
done.wait()
if writer.status != .completed {
  fputs("status \(writer.status.rawValue) \(String(describing: writer.error))\n", stderr)
  exit(1)
}
