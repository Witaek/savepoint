# Collections and DLC: splitting a game

Some collections are one Steam app with one achievement list: _KINGDOM HEARTS -HD 1.5+2.5
ReMIX-_ holds four games, but Steam shows a single list of achievements and a single percentage.
Savepoint can split such a game into groups, each with its own progress bar and its own 100%.
The same works for DLC (a group of the DLC's achievements).

A split belongs to the game, not to a person: everyone on your server sees it and can change it.

## Make a split

On the game page, under the achievements, tap **A collection, or has DLC? Split it into games**.

1. **Suggested groups.** If the achievements' API names start with a few different prefixes
   (`KH1_…`, `KH2_…`, `BBS_…`), Savepoint offers one group per prefix. Name them and tap
   **Create these groups**. With IGDB configured, the names of the games in the collection are
   offered as you type.
2. **Groups.** Add, rename, reorder or remove groups, and mark each as a **Game** or **DLC**.
3. **Rules** put many achievements in a group at once, tried in order (the first that matches
   wins):
   - _The API name starts with…_ (the code Steam uses for each achievement, shown under each one);
   - _Its position in Steam's list is from… to…_ (Steam usually lists a collection game by game);
   - _Its name or description contains…_ (a character or a world, for instance).
4. **By hand.** Under **Achievements**, **No group** lists what no rule took. Tick achievements,
   then choose a group in the bar at the bottom and tap **Move**. Achievements moved by hand stay
   where you put them when rules change; **Back to the rules** undoes that.

Rules also apply to achievements Steam adds later (DLC, updates).

## What changes on the game page

A row of parts appears above the achievements: one per group, with its progress, plus **Other**
(what no group took) and **All**. Tap one to see its achievements and checklist. A checklist item
added while a group is selected belongs to that group.

The game's overall percentage, the library and the Hall of Fame still count the whole game:
that's what Steam counts too.

## Share a split

**Download** saves the split as a small JSON file. **Import a file** on another server (or
another game) replaces its split with the file's.

Splits for well-known collections can ship with Savepoint: a file named after the Steam app id in
[`src/lib/server/splits/`](../src/lib/server/splits/README.md) is applied automatically the first
time Savepoint reads that game's achievements, unless someone already split it. If you make a good
split for a collection, add its file there (a pull request) so it works for everyone.
