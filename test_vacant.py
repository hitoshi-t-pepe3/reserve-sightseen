import asyncio
from app.tools.rakuten_travel import rakuten_travel_tool, RakutenVacantSearchParams

async def test():
    params = RakutenVacantSearchParams(
        hotel_no='172139',
        checkin_date='2026-07-15',
        checkout_date='2026-07-16',
        adult_num=2,
        room_num=1,
        sort='+room_num=1,
        sort='+roomCharge',
    )
    result = await rakuten_travel_tool.search_vacant_hotels(params)
    print('Keys:', result.keys())
    hotels = result.get('hotels', [])
    print('Hotels type:', type(hotels), 'len:', len(hotels))
    if hotels:
        print('First hotel type:', type(hotels[0]))
        if isinstance(hotels[0], list):
            for i, elem in enumerate(hotels[0]):
                print(f'  Element {i}: {type(elem)}, keys: {elem.keys() if isinstance(elem, dict) else "N/A"}')
        elif isinstance(hotels[0], dict):
            print('Keys:', list(hotels[0].keys()))

asyncio.run(test())