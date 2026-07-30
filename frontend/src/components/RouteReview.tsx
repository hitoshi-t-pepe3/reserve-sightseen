"use client";

import { useState } from "react";
import * as React from "react";
import { Itinerary } from "@/lib/api";

interface Review {
  rating: number;
  comment: string;
  timestamp: string;
}

interface RouteReviewProps {
  planId?: string;
  itinerary: Itinerary;
}

export function RouteReview({ planId, itinerary }: RouteReviewProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load existing reviews on mount
  React.useEffect(() => {
    if (planId) {
      try {
        const key = `route-reviews-${planId}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setReviews(parsed);
          }
        }
      } catch (error) {
        console.warn("Failed to load reviews:", error);
      }
    }
  }, [planId]);

  const handleSubmit = () => {
    if (rating === 0) {
      setValidationError("評価を選択してください");
      return;
    }
    setValidationError(null);

    const review: Review = {
      rating,
      comment,
      timestamp: new Date().toISOString(),
    };

    // LocalStorage に保存
    if (planId) {
      const key = `route-reviews-${planId}`;
      const existing = localStorage.getItem(key);
      const allReviews = existing ? JSON.parse(existing) : [];
      allReviews.push(review);
      localStorage.setItem(key, JSON.stringify(allReviews));
      setReviews(allReviews);
    }

    setSubmitted(true);
    setRating(0);
    setComment("");
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      <h3 className="font-semibold text-gray-800">
        このルートはいかがでしたか？
      </h3>

      <div className="space-y-3">
        <div>
          <label className="text-sm text-gray-600 block mb-2">評価（☆）</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => {
                  setRating(star);
                  setValidationError(null);
                }}
                className={`text-2xl transition ${
                  rating >= star ? "text-yellow-400" : "text-gray-300"
                }`}
              >
                ★
              </button>
            ))}
          </div>
          {validationError && (
            <p className="text-xs text-red-600 mt-2">{validationError}</p>
          )}
        </div>

        <div>
          <label className="text-sm text-gray-600 block mb-2">
            コメント（任意）
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="このルートの感想を教えてください"
            maxLength={200}
            className="w-full text-sm p-2 border border-gray-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
          />
          <p className="text-xs text-gray-500 mt-1">{comment.length}/200</p>
        </div>

        <button
          onClick={handleSubmit}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2 rounded transition"
        >
          {submitted ? "✓ レビューを送信しました" : "レビューを送信"}
        </button>
      </div>

      {reviews.length > 0 && (
        <div className="pt-4 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-800 mb-2">
            レビュー ({reviews.length})
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {reviews.map((review, idx) => (
              <div
                key={idx}
                className="text-xs bg-gray-50 p-2 rounded border border-gray-200"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-yellow-400">
                    {"★".repeat(review.rating)}
                  </span>
                  <span className="text-gray-500">
                    {new Date(review.timestamp).toLocaleDateString("ja-JP")}
                  </span>
                </div>
                {review.comment && (
                  <p className="text-gray-700">{review.comment}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
