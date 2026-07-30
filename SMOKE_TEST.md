# Smoke Tests - Quick Verification Before User Testing

Run these tests locally to verify the system works before inviting users to test.

## Quick Local Tests

### 1. Frontend Build Verification
```bash
cd frontend
npm run build
# Expected: Build completes without errors
# Output: No TypeScript errors, no warnings about missing types
```

### 2. Component Tests
```bash
cd frontend
npm run test:e2e
# Expected: All tests pass or at least no blocking errors
```

### 3. Backend API Health (if running locally)
```bash
curl -s http://127.0.0.1:8000/health | jq .
# Expected: {"status":"healthy"}
```

### 4. Route Optimization API
```bash
curl -s -X POST http://127.0.0.1:8000/api/route/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "origin": {"lat": 34.6897, "lng": 139.6917, "name": "Tokyo"},
    "waypoints": [
      {"lat": 34.6899, "lng": 139.6921, "name": "Spot 1"},
      {"lat": 34.6895, "lng": 139.6915, "name": "Spot 2"}
    ],
    "destination": {"lat": 34.6897, "lng": 139.6917, "name": "Tokyo"}
  }' | jq .
# Expected: optimized_order array with distance/duration, route_summary, recommended_transport
```

### 5. Route Recommendations API
```bash
curl -s -X POST http://127.0.0.1:8000/api/route/recommendations \
  -H "Content-Type: application/json" \
  -d '{
    "route_waypoints": [
      {"lat": 34.6897, "lng": 139.6917},
      {"lat": 34.6899, "lng": 139.6921}
    ],
    "keywords": ["飲食店", "カフェ"],
    "radius_m": 500,
    "limit_per_location": 3
  }' | jq .
# Expected: recommendations array with name, category, rating, address, distance
```

### 6. Hotel Search API
```bash
curl -s "http://127.0.0.1:8000/api/hotels/search-area?area=京都&hits=3" | jq .hotels[0].hotelBasicInfo
# Expected: Hotel with hotelName, hotelMinCharge, latitude, longitude, address1, address2
```

### 7. Route Share API
```bash
curl -s -X POST http://127.0.0.1:8000/api/route/share \
  -H "Content-Type: application/json" \
  -d '{
    "title": "京都観光プラン",
    "mode": "travel",
    "transport": "train",
    "days": [{"label": "Day 1", "items": []}]
  }' | jq .
# Expected: share_id (base64 string), share_url
```

### 8. Route Restore API
```bash
SHARE_ID=$(curl -s -X POST http://127.0.0.1:8000/api/route/share \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","mode":"travel","days":[]}' | jq -r .share_id)

curl -s "http://127.0.0.1:8000/api/route/restore/$SHARE_ID" | jq .
# Expected: Decoded route object matching original
```

## Regression Tests

### ✅ Feature 1: Itinerary Generation
- [ ] Chat generates 3-day travel itinerary
- [ ] Timeline displays all items in order
- [ ] Checkboxes work for marking visited
- [ ] Save button shows "✓ 保存済み"
- [ ] Plan persists in localStorage

### ✅ Feature 2: Hotel Card Generation (Rakuten)
- [ ] Hotel card displays without 400 errors
- [ ] Images load (hotelImageUrl, roomImageUrl)
- [ ] Rating and price display correctly
- [ ] "楽天で予約" button is clickable
- [ ] Click tracking works (GA4 event)

### ✅ Feature 3: Jalan Card Generation
- [ ] Jalan link generates without 400 errors
- [ ] URL is properly encoded
- [ ] Link opens Jalan search page

### ✅ Feature 4: Route Optimization
- [ ] Map displays with all waypoints
- [ ] Route summary shows correctly
- [ ] Distance and duration are accurate
- [ ] Recommended transport badge appears
- [ ] Recommendations load without errors

### ✅ Feature 5: Sharing
- [ ] Copy URL works (no alerts)
- [ ] Error message displays inline if copy fails
- [ ] Share URL is valid base64
- [ ] Shared link restores itinerary

### ✅ Feature 6: Reviews & Ratings
- [ ] Rating stars clickable
- [ ] Inline validation error (no alert)
- [ ] Review submits successfully
- [ ] Success message shows "✓ レビューを送信しました"
- [ ] Reviews persist in localStorage

### ✅ Feature 7: Error Handling
- [ ] Network timeout shows graceful error
- [ ] Missing API key shows helpful message
- [ ] Empty search shows "No results"
- [ ] No alert dialogs (all inline)

## User Testing Checklist

**Before inviting users:**
1. [ ] All smoke tests pass
2. [ ] No console errors during normal usage
3. [ ] No TypeScript type errors in build
4. [ ] Components render correctly on mobile
5. [ ] Keyboard navigation works (accessibility)
6. [ ] No infinite loops or memory leaks
7. [ ] API rate limiting handled gracefully

**During user testing:**
1. [ ] Monitor browser console for errors
2. [ ] Record any feature requests
3. [ ] Note any confusing UI elements
4. [ ] Check affiliate link success rate
5. [ ] Measure time to generate itinerary
6. [ ] Verify all shared links work
7. [ ] Test on both desktop and mobile

**Post-testing:**
1. [ ] Analyze user feedback
2. [ ] Fix any critical bugs
3. [ ] Improve unclear UX
4. [ ] Optimize slow operations
5. [ ] Prepare for production deployment

## Performance Baselines

Measure these during user testing:

- Itinerary generation: < 10 seconds
- Map rendering: < 3 seconds
- Hotel card load: < 5 seconds
- Route optimization: < 5 seconds
- Page navigation: < 1 second
- Share URL copy: < 1 second

## Known Limitations

- No backend data persistence (localStorage only)
- No user authentication
- Rate limiting may affect rapid requests
- Offline mode not supported
- Limited to 10 saved plans (device storage)

## Quick Start for Users

```bash
# 1. Start frontend
cd frontend && npm run dev
# Opens http://localhost:3000 (or 3001 if 3000 in use)

# 2. Optional: Start backend (if API changes made)
cd backend && uvicorn app.main:app --reload --port 8000

# 3. Open http://localhost:3000 in browser
# Try example: "京都の3日間旅行を計画して"
```

