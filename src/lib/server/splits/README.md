# Shipped splits

Each file here splits one Steam app into groups with their own progress: the games of a
collection sold as one app, or DLC. It's named after the Steam app id (`2552430.json`) and is
applied automatically the first time Savepoint reads that game's achievements, unless someone on
the server already split it.

Make one in the app (game page → **Split into games**), then **Export** and save the file here.
The format:

```json
{
	"format": 1,
	"steamAppId": 2552430,
	"name": "KINGDOM HEARTS -HD 1.5+2.5 ReMIX-",
	"groups": [
		{
			"name": "Kingdom Hearts Final Mix",
			"kind": "game",
			"rules": [{ "type": "prefix", "value": "KH1_" }],
			"achievements": []
		},
		{
			"name": "Re:Chain of Memories",
			"kind": "game",
			"rules": [{ "type": "range", "from": 57, "to": 92 }],
			"achievements": ["SOME_API_NAME"]
		}
	]
}
```

- `rules` are tried in file order across groups; the first that matches an achievement wins.
  `prefix`: the API name starts with `value`. `range`: positions `from`–`to` in Steam's list
  (from 1). `contains`: the name or description contains `value` (any case).
- `achievements` lists API names placed in the group by hand, whatever the rules say.
- `kind` is `game` or `dlc`.

The values above are an example of the format, not a real split.
