export function MiraAvatar({ size = 120, className = "", speaking = false }) {
  return (
    <div className={`mira-avatar relative shrink-0 ${className}`} style={{ width: size, height: size }} data-testid="mira-avatar" aria-hidden>
      <span className="mira-ring mira-ring-1" />
      <span className="mira-ring mira-ring-2" />
      <span className="mira-orbit"><i className="mira-spark s1">✦</i><i className="mira-spark s2">✦</i><i className="mira-spark s3">·</i></span>
      <div className="mira-glow" />
      <div className="mira-body">
        <img src="/assets/mira/mira.png" alt="" className="w-full h-full object-contain object-bottom drop-shadow-[0_18px_30px_rgba(0,0,0,.55)]" />
      </div>
      <span className="mira-badge">{speaking ? <span className="mira-dots"><i /><i /><i /></span> : "AI"}</span>
    </div>
  );
}
