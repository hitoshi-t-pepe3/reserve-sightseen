"use client";

import { trackAffiliateClick } from "@/lib/analytics";

// A8.net 経由の日本旅行（新幹線＋宿セット）広告。素材（リンク・バナー・
// 計測ピクセル）は A8 管理画面で発行されたものをそのまま使う（改変禁止）。
const CLICK_URL = "https://px.a8.net/svt/ejp?a8mat=4B7ZH6+5B45YQ+Z9G+NW4I9";
const BANNER_URL =
  "https://www27.a8.net/svt/bgt?aid=260713050321&wid=001&eno=01&mid=s00000004570004013000&mc=1";
const BEACON_URL = "https://www10.a8.net/0.gif?a8mat=4B7ZH6+5B45YQ+Z9G+NW4I9";

// 電車の旅行プランの日程表の下に出す予約導線
export function NipponTravelAd() {
  return (
    <div className="px-4 pb-4 flex flex-col items-center gap-1">
      <span className="text-[10px] text-gray-400 tracking-wider">PR</span>
      <a
        href={CLICK_URL}
        rel="nofollow sponsored noopener"
        target="_blank"
        onClick={() => trackAffiliateClick("nippon_travel")}
      >
        <img
          src={BANNER_URL}
          width={320}
          height={50}
          alt="日本旅行 新幹線＋宿セット"
          className="border-0 max-w-full h-auto"
        />
      </a>
      <img src={BEACON_URL} width={1} height={1} alt="" className="border-0" />
      <p className="text-xs text-gray-600">新幹線＋宿のセットは日本旅行で探せます</p>
    </div>
  );
}
