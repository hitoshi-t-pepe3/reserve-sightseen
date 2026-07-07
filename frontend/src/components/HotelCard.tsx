"use client";

import { HotelBasicInfo } from "@/lib/api";

interface HotelCardProps {
  hotel: HotelBasicInfo;
  onSelect?: (hotel: HotelBasicInfo) => void;
  showVacancyButton?: boolean;
  checkin?: string;
  checkout?: string;
}

export function HotelCard({
  hotel,
  onSelect,
  showVacancyButton = false,
  checkin,
  checkout,
}: HotelCardProps) {
  const imageUrl = hotel.hotelThumbnailUrl || hotel.hotelImageUrl;
  const minCharge = hotel.hotelMinCharge ? `¥${hotel.hotelMinCharge.toLocaleString()}/泊〜` : '料金未定';
  const rating = hotel.reviewAverage ? hotel.reviewAverage.toFixed(1) : '－';
  const reviewCount = hotel.reviewCount ? `(${hotel.reviewCount}件)` : '';

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => onSelect?.(hotel)}
    >
      {/* Image */}
      <div className="relative h-48 bg-gray-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={hotel.hotelName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
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
          <span className="text-red-600 font-bold text-lg">{minCharge}</span>
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

        {/* Vacancy Button */}
        {showVacancyButton && checkin && checkout && (
          <button
            className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
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