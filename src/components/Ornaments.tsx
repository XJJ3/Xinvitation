// 中式角花装饰（卷草纹），用于卡片四角。通过 className 控制位置与翻转。
export function CornerOrnament({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 4 H44 M4 4 V44"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M10 10 H38 M10 10 V38"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.7"
      />
      <path
        d="M10 26 C10 18 16 12 24 12 C20 18 18 22 18 28 C24 24 30 24 34 28 C28 30 22 32 18 38 C16 30 12 28 10 26 Z"
        fill="currentColor"
        opacity="0.85"
      />
      <circle cx="13" cy="13" r="2" fill="currentColor" />
    </svg>
  );
}

// 顶部「囍」毛笔字（参考图1的金色大囍）
export function DoubleHappiness({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-kai leading-none select-none ${className}`}
      style={{ fontWeight: 700 }}
      aria-label="双喜"
    >
      囍
    </span>
  );
}

// 圆形囍徽章（参考图2的金色印章）
export function HappinessSeal({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-full border-2 border-china-gold ${className}`}
      aria-hidden="true"
    >
      <span
        className="font-kai text-china-gold leading-none"
        style={{ fontWeight: 700 }}
      >
        囍
      </span>
    </div>
  );
}
