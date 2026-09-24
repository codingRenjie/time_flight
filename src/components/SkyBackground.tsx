/**
 * 动态背景组件。
 * v1 占位：静态图 + CSS Ken Burns 缓慢漂移；
 * 后续替换为无缝循环视频时只需传 videoSrc（建议 5-10s、去音轨、1-3MB）。
 */
export function SkyBackground({
  image,
  videoSrc,
  dim = 0.35,
}: {
  image: string;
  videoSrc?: string;
  dim?: number;
}) {
  return (
    <div className="sky-bg" aria-hidden>
      {videoSrc ? (
        <video
          key={videoSrc}
          className="sky-bg-media"
          src={videoSrc}
          poster={image}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : (
        <img className="sky-bg-media sky-bg-kenburns" src={image} alt="" />
      )}
      <div
        className="sky-bg-overlay"
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,${dim * 0.6}) 0%, rgba(0,0,0,${dim}) 55%, rgba(0,0,0,${Math.min(1, dim + 0.25)}) 100%)`,
        }}
      />
    </div>
  );
}
