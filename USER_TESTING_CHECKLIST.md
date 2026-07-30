# User Testing Checklist

## Overview
This checklist guides testing of key features before final deployment. Focus on user satisfaction and smooth experience.

## Core Features to Test

### 1. Itinerary Generation & Saving
- [ ] Chat generates itinerary correctly
- [ ] "日程表を作成・保存しました" message appears
- [ ] Timeline displays all items with correct order
- [ ] Checkboxes work for marking visited items
- [ ] Save button shows "✓ 保存済み" after saving
- [ ] Saved plans appear in "📚 保存プラン" panel
- [ ] Plan deletion works with 2-tap confirmation

### 2. Affiliate Card Generation
- [ ] Rakuten hotel cards display without errors
- [ ] Hotel card images load properly
- [ ] "楽天で予約" button is clickable and visible
- [ ] Jalan (じゃらん) hotel cards generate without 400 errors
- [ ] Price information displays correctly
- [ ] Hotel ratings and review counts are accurate

### 3. Route Optimization & Display
- [ ] Map displays with all waypoints
- [ ] Route summary shows: "✨ [description]"
- [ ] Distance and duration display correctly (e.g., "35km | 約5時間")
- [ ] Recommended transport shows: "🚶 [mode]" badge
- [ ] Route recommendations show nearby restaurants/cafes/shops
- [ ] Recommendation summary appears (e.g., "restaurant(3)・cafe(2)・shop(1)")

### 4. Sharing Features
- [ ] Share button is visible in saved plans
- [ ] **[IMPROVED]** Clipboard copy works without alert() dialogs
- [ ] **[IMPROVED]** Inline error message appears if copy fails
- [ ] "✓ コピーしました" feedback displays for 2 seconds
- [ ] Share URL contains base64-encoded itinerary
- [ ] Native share API opens on supported browsers

### 5. Route Popularity & Reviews
- [ ] **[IMPROVED]** RoutePopularity shows stats when available
- [ ] **[IMPROVED]** RoutePopularity hides gracefully when no stats
- [ ] **[IMPROVED]** Review rating stars display correctly
- [ ] **[IMPROVED]** Inline validation error appears (no alert())
- [ ] Error message: "評価を選択してください" displays inline
- [ ] Review submission feedback: "✓ レビューを送信しました"
- [ ] Review history loads on component mount
- [ ] Star rating clears validation error when selected

### 6. Seasonal Suggestions
- [ ] **[IMPROVED]** Seasonal suggestions display without errors
- [ ] Correct season detected (spring/summer/autumn/winter)
- [ ] Season keywords display as tags
- [ ] Emoji matches season (🌸/🎆/🍁/❄️)
- [ ] Gradient background renders correctly

### 7. Hotel Reservation Info
- [ ] Hotel reservation dialog opens on button click
- [ ] Form fields: Hotel name, Check-in, Check-out, Reservation #
- [ ] Data saves to localStorage
- [ ] Saved data persists across page refreshes
- [ ] Edit button works in both modes

### 8. Walk Mode
- [ ] "🚶 散歩" button visible for walk-mode plans
- [ ] Walk mode screen displays without errors
- [ ] Route displays on map with waypoints
- [ ] Can close walk mode and return to plan list

### 9. Budget Allocation
- [ ] "💰 予算" button visible for travel plans
- [ ] Budget panel opens/closes correctly
- [ ] Can allocate budget across categories
- [ ] Budget totals calculate correctly
- [ ] Data persists in localStorage

### 10. Chat Features
- [ ] Chat sends messages without errors
- [ ] Nearby chat works for individual locations
- [ ] Chat uses correct geohash for location
- [ ] Messages stream properly
- [ ] Rate limiting doesn't block legitimate requests

## Edge Cases to Test

### Error Handling
- [ ] Network timeout during API call shows graceful error
- [ ] Missing API key shows helpful message
- [ ] Invalid coordinates handled without crash
- [ ] Empty search results show "No results" message

### Data Validation
- [ ] Itinerary with missing coordinates doesn't break map
- [ ] Hotel response with missing fields displays gracefully
- [ ] Review with max length (200 chars) submits correctly
- [ ] Duplicate item names don't cause confusion

### Performance
- [ ] Large itineraries (50+ items) load reasonably
- [ ] Switching between saved plans is smooth
- [ ] Scrolling timeline is smooth and responsive
- [ ] Map rendering doesn't lag

### Cross-browser/Device
- [ ] Desktop: Chrome, Firefox, Safari
- [ ] Mobile: iOS Safari, Android Chrome
- [ ] PWA install works
- [ ] Native share works on mobile

## UX Improvements Made (This Session)

### RouteReview.tsx
- ✅ Load existing reviews on mount
- ✅ Replace `alert()` with inline validation error
- ✅ Error clears when user selects rating
- ✅ Better error feedback: "評価を選択してください"

### RoutePopularity.tsx
- ✅ Initialize with default stats (no null)
- ✅ Only show when there's meaningful data
- ✅ Better error handling for localStorage
- ✅ Graceful fallback for missing stats

### SeasonalRouteSuggestion.tsx
- ✅ Remove unused latitude/longitude props
- ✅ Remove non-functional button
- ✅ Fix JSX.Element type import
- ✅ Cleaner component signature

### ShareButton.tsx (Previous Session)
- ✅ Try navigator.clipboard first
- ✅ Fallback to textarea.select() method
- ✅ Proper error handling with 3-second timeout
- ✅ Error message: "シェア URL の生成に失敗しました"

## Test Scenarios

### Scenario 1: Complete Travel Plan
1. Create travel plan via chat: "京都の3日間旅行を計画して"
2. Verify itinerary generates with hotels, spots, meals
3. Check route optimization displays correctly
4. Test sharing: Copy URL → Verify it works
5. Test review: Submit 5-star review with comment
6. Test reservation: Add hotel info
7. Save plan to localStorage

### Scenario 2: Walk Route in Tokyo
1. Create walk route: "銀座での45分散歩コース"
2. Verify route with 5-10 waypoints
3. Test map display
4. Test walk mode feature
5. Verify seasonal suggestions appear
6. Test sharing

### Scenario 3: Multi-day Drive
1. Create drive itinerary: "箱根への日帰りドライブ"
2. Verify route optimization
3. Test hotel search integration
4. Verify affiliate links work
5. Test all sharing features

## Metrics to Track

- Time to generate itinerary
- Successful affiliate link clicks
- Share URL success rate
- Review submission rate
- Error messages frequency
- Component render performance

## Known Limitations

- Rakuten API quota limits (100 req/minute)
- Google Places API daily quota
- No backend persistence (localStorage only)
- No user accounts (device-local storage)
- Offline mode not supported

## Next Steps After Testing

1. Collect user feedback
2. Fix any reported issues
3. Optimize performance bottlenecks
4. Prepare for production deployment
5. Set up monitoring/analytics
6. Plan for user feedback loop

