"use client";

import { useState } from "react";

interface HotelImageCarouselProps {
  images: string[];
  alt: string;
}

// ホテルカードの画像表示。複数枚あればスライドで見られる（外観・部屋など）
export function HotelImageCarousel({ images, alt }: HotelImageCarouselProps) {
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  const go = (delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setIndex((i) => (i + delta + images.length) % images.length);
  };

  return (
    <div className="relative w-full h-full group">
      <img
        src={images[index]}
        alt={alt}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => go(-1, e)}
            className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="前の画像"
          >
            ‹
          </button>
          <button
            onClick={(e) => go(1, e)}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="次の画像"
          >
            ›
          </button>
          <div className="absolute bottom-1.5 left-0 right-0 flex justify-center gap-1">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(i);
                }}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === index ? "bg-white" : "bg-white/50"
                }`}
                aria-label={`${i + 1}枚目の画像を表示`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
