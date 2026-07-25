"use client";

import { HotelBasicInfo } from "@/lib/api";
import { HotelImageCarousel } from "./HotelImageCarousel";
import { trackAffiliateClick, trackEvent } from "@/lib/analytics";

interface HotelCardProps {
  hotel: HotelBasicInfo;
  onSelect?: (hotel: HotelBasicInfo) => void;
  showVacancyButton?: boolean;
  checkin?: string;
  checkout?: string;
  // 指定すると「楽天トラベルで予約」ボタンを表示（日付・人数プリセット済みURL）
  reserveUrl?: string;
}

export function HotelCard({
  hotel,
  onSelect,
  showVacancyButton = false,
  checkin,
  checkout,
  reserveUrl,
}: HotelCardProps) {
  // hotelThumbnailUrl は小さい画像で、カードいっぱいに引き伸ばすと粗く見えるため
  // 実寸の写真（外観・部屋）だけをスライド対象にし、重複URLは除く
  const images = Array.from(
    new Set([hotel.hotelImageUrl, hotel.roomImageUrl].filter((u): u is string => !!u))
  );
  const rating = hotel.reviewAverage ? hotel.reviewAverage.toFixed(1) : '－';
  const reviewCount = hotel.reviewCount ? `(${hotel.reviewCount}件)` : '';

  // hotelMinChargeRestrictedOnly: 年齢/記念日限定等の特典プランしか空室がなく、
  // 一般ユーザー向けの実勢価格として提示できない場合。
  // hotelMinChargeUnavailable: 空室検索で実勢価格を検証できず、施設検索APIの理論値
  // （空室0件時に極端に低い値が返ることがある）をそのまま使わざるを得ない場合。
  // どちらも金額をそのまま出すと誤解を招くため「要確認」表記に切り替える。
  const priceUnreliable = hotel.hotelMinChargeRestrictedOnly || hotel.hotelMinChargeUnavailable;
  const minCharge = priceUnreliable
    ? '料金は日程により変動（要確認）'
    : hotel.hotelMinCharge
      ? `¥${hotel.hotelMinCharge.toLocaleString()}/泊〜`
      : '料金未定';

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => onSelect?.(hotel)}
    >
      {/* Image */}
      <div className="relative h-48 bg-gray-100">
        <HotelImageCarousel images={images} alt={hotel.hotelName} />
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 text-lg line-clamp-1 mb-2">
          {hotel.hotelName}
        </h3>

        {/* Rating & Price */}
        <div className="flex items-center gap-3 mb-3">
          <span className="flex items-center gap-1 text-yellow-600 font-medium">
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {rating} {reviewCount}
          </span>
          <span
            className={
              priceUnreliable
                ? "text-gray-500 text-sm"
                : "text-red-600 font-bold text-lg"
            }
          >
            {minCharge}
          </span>
        </div>

        {/* Location */}
        {hotel.nearestStation && (
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {hotel.nearestStation}
          </div>
        )}

        {/* Address */}
        <p className="text-sm text-gray-600 line-clamp-2 mb-3">
          {hotel.address1}{hotel.address2}
        </p>

        {/* Special / Feature */}
        {hotel.hotelSpecial && (
          <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded-lg line-clamp-2 mb-3">
            {hotel.hotelSpecial}
          </p>
        )}

        {/* Reserve Button - Primary CTA */}
        {reserveUrl && (
          <a
            href={reserveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 px-4 bg-red-600 text-white text-center rounded-lg hover:bg-red-700 active:bg-red-800 transition-colors font-semibold text-base mb-2 shadow-md hover:shadow-lg"
            onClick={(e) => {
              e.stopPropagation();
              trackAffiliateClick("rakuten", { surface: "hotel_card" });
            }}
          >
            🏨 楽天トラベルで予約する
          </a>
        )}

        {/* Jalan Compare Link - Secondary CTA */}
        {hotel.jalanSearchUrl && (
          <a
            href={hotel.jalanSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-2 px-3 border border-orange-300 text-orange-600 text-center rounded-lg hover:bg-orange-50 transition-colors text-xs font-medium mb-2"
            onClick={(e) => {
              e.stopPropagation();
              trackAffiliateClick("jalan", { surface: "hotel_card" });
            }}
          >
            じゃらんでも見る（価格比較）
          </a>
        )}

        {/* Vacancy Button - Tertiary CTA */}
        {showVacancyButton && checkin && checkout && (
          <button
            className="w-full py-2 px-3 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-xs font-medium"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(hotel);
            }}
          >
            空室・プランを見る
          </button>
        )}
      </div>
    </div>
  );
}