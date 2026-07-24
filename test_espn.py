import requests, json

r = requests.get("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard")
data = r.json()
events = data.get("events", [])
print(f"Games found: {len(events)}")
for e in events:
    print(f"  {e.get('shortName')} - {e['status']['type']['shortDetail']}")

if events:
    game_id = events[0].get("id")
    r2 = requests.get("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary", params={"event": game_id})
    box = r2.json()
    players_data = box.get("boxscore", {}).get("players", [])
    print(f"\nBoxscore players groups: {len(players_data)}")
    for team in players_data:
        tri = team.get("team", {}).get("abbreviation", "?")
        stats = team.get("statistics", [{}])[0]
        athletes = stats.get("athletes", [])
        labels = stats.get("labels", [])
        print(f"  {tri}: {len(athletes)} players")
        print(f"  Labels type: {type(labels[0]) if labels else 'none'}")
        print(f"  Labels (first 10): {labels[:10]}")
        if athletes:
            a = athletes[0]
            print(f"  First athlete: {a.get('athlete', {}).get('displayName')} stats={a.get('stats', [])}")
