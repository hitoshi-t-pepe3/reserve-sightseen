"use client";

// A8.net 経由のじゃらん広告。素材（リンク・バナー・計測ピクセル）は
// A8 管理画面で発行されたものをそのまま使う（改変するとA8の規約に触れる）。
const CLICK_URL = "https://px.a8.net/svt/ejp?a8mat=4B7ZH6+59XAR6+14CS+6C9LD";
const BANNER_URL =
  "https://www25.a8.net/svt/bgt?aid=260713050319&wid=001&eno=01&mid=s00000005230001065000&mc=1";
const BEACON_URL = "https://www12.a8.net/0.gif?a8mat=4B7ZH6+59XAR6+14CS+6C9LD";

// ホテルカードの並びの最後に置く「じゃらんで宿を探す」広告カード
export function JalanAd() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 h-full flex flex-col items-center justify-center gap-2">
      <span className="text-[10px] text-gray-400 tracking-wider">PR</span>
      <a href={CLICK_URL} rel="nofollow sponsored noopener" target="_blank">
        <img src={BANNER_URL} width={120} height={60} alt="じゃらんnet" className="border-0" />
      </a>
      <img src={BEACON_URL} width={1} height={1} alt="" className="border-0" />
      <p className="text-xs text-gray-600 text-center">じゃらんnetでも宿を探せます</p>
    </div>
  );
}
