// Fixed, non-interactive animated gradient mesh behind all content.
export default function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="aurora-blob animate-drift"
        style={{ top: "-15%", left: "-10%", width: "45vw", height: "45vw", background: "radial-gradient(circle at 30% 30%, #6d5efc, transparent 70%)" }}
      />
      <div
        className="aurora-blob animate-drift-slow"
        style={{ top: "5%", right: "-15%", width: "40vw", height: "40vw", background: "radial-gradient(circle at 60% 40%, #2dd4bf, transparent 70%)" }}
      />
      <div
        className="aurora-blob animate-drift"
        style={{ bottom: "-20%", left: "20%", width: "50vw", height: "50vw", background: "radial-gradient(circle at 50% 50%, #a855f7, transparent 70%)", animationDelay: "-8s" }}
      />
      {/* Fine grid overlay for the tech feel */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)",
        }}
      />
    </div>
  );
}
