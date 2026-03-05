"""
Wrestling Video Crawler
Searches YouTube for folkstyle wrestling instruction videos,
tags them by move type, position, difficulty, and age group,
then adds them to the database.
"""

import yt_dlp
import re
import sys
from datetime import datetime
from app import app, db, Video

# ─── Search Queries ───────────────────────────────────────────────────────────

SEARCH_QUERIES = [
    # Takedowns
    "folkstyle wrestling single leg takedown instruction",
    "folkstyle wrestling double leg takedown basics",
    "youth wrestling ankle pick tutorial",
    "kids wrestling fireman's carry technique",
    "youth wrestling duck under technique",
    "folkstyle wrestling high crotch takedown",
    "wrestling snap down technique youth",
    # Top / Riding
    "folkstyle wrestling tilt technique",
    "youth wrestling half nelson pin",
    "wrestling cradle technique kids",
    "folkstyle wrestling leg riding basics",
    "youth wrestling turk and tilt",
    # Bottom / Escapes
    "folkstyle wrestling stand up escape",
    "youth wrestling switch technique",
    "wrestling sit out escape technique",
    "folkstyle bottom wrestling basics",
    # Defense
    "wrestling shot defense sprawl technique",
    "youth wrestling whizzer defense",
    "folkstyle wrestling underhook defense",
    # Fundamentals
    "youth wrestling stance and motion drill",
    "folkstyle wrestling level change drill",
    "kids wrestling penetration step technique",
    "youth wrestling chain wrestling basics",
    "folkstyle wrestling hand fighting technique",
    # FloWrestling / RUDIS channels
    "FloWrestling youth technique",
    "RUDIS wrestling kids tutorial",
    "Rudis wrestling instruction elementary",
]

# ─── Tagging Logic ────────────────────────────────────────────────────────────

MOVE_KEYWORDS = {
    'single leg':       ['single leg', 'single-leg', 'singles'],
    'double leg':       ['double leg', 'double-leg', 'doubles'],
    'ankle pick':       ['ankle pick', 'ankle-pick'],
    "fireman's carry":  ["fireman's carry", 'firemans carry', 'fireman carry'],
    'duck under':       ['duck under', 'duck-under'],
    'high crotch':      ['high crotch', 'high-crotch'],
    'snap down':        ['snap down', 'snap-down'],
    'tilt':             ['tilt', 'turk and tilt', 'leg tilt'],
    'half nelson':      ['half nelson', 'half-nelson'],
    'cradle':           ['cradle', 'near side cradle', 'far side cradle'],
    'leg ride':         ['leg ride', 'leg riding', 'legs in'],
    'stand up':         ['stand up', 'stand-up', 'standup'],
    'switch':           ['switch technique', 'switch move'],
    'sit out':          ['sit out', 'sit-out'],
    'sprawl':           ['sprawl', 'shot defense'],
    'whizzer':          ['whizzer'],
    'underhook':        ['underhook', 'under hook'],
    'chain wrestling':  ['chain wrestling', 'chains'],
    'hand fighting':    ['hand fight', 'hand-fighting', 'wrist control'],
    'stance':           ['stance', 'stance and motion', 'position'],
    'penetration step': ['penetration step', 'level change'],
}

POSITION_KEYWORDS = {
    'neutral': ['neutral', 'takedown', 'shot', 'tie up', 'tie-up', 'stance'],
    'top':     ['top', 'riding', 'tilt', 'pin', 'half nelson', 'cradle', 'leg ride', 'breakdown'],
    'bottom':  ['bottom', 'escape', 'reversal', 'stand up', 'switch', 'sit out'],
}

DIFFICULTY_KEYWORDS = {
    'beginner':     ['beginner', 'basic', 'fundamental', 'intro', 'youth', 'kids', 'elementary', 'young'],
    'intermediate': ['intermediate', 'technique', 'drill', 'improve'],
    'advanced':     ['advanced', 'college', 'high school', 'elite', 'championship'],
}

AGE_KEYWORDS = {
    'elementary (6-10)': ['elementary', 'kids', 'youth', 'young', '6', '7', '8', '9', '10'],
    'middle school (11-14)': ['middle school', 'junior high', 'junior', '11', '12', '13', '14'],
}

TRUSTED_CHANNELS = [
    'flowrestling', 'flo wrestling', 'rudis', 'rudis wrestling',
    'dan gable', 'cary kolat', 'wrestling with char', 'cklwrestling',
    'national wrestling hall of fame', 'willie saylor'
]

def tag_video(title, description, channel):
    """Auto-tag a video based on title, description, and channel."""
    text = f"{title} {description} {channel}".lower()

    move_type = None
    for move, keywords in MOVE_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            move_type = move
            break

    position = None
    for pos, keywords in POSITION_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            position = pos
            break

    difficulty = 'beginner'  # Default for youth wrestling
    for diff, keywords in DIFFICULTY_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            difficulty = diff
            break

    age_group = 'elementary (6-10)'  # Default since coaching 6-12
    for age, keywords in AGE_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            age_group = age
            break

    # Build tag list
    all_tags = []
    if move_type:
        all_tags.append(move_type)
    if position:
        all_tags.append(position)
    all_tags.append(difficulty)
    all_tags.append('folkstyle')
    all_tags.append('wrestling')

    return {
        'move_type': move_type,
        'position': position,
        'difficulty': difficulty,
        'age_group': age_group,
        'style': 'folkstyle',
        'tags': ', '.join(all_tags),
    }

def is_relevant(title, description, duration):
    """Filter out irrelevant videos (matches, recaps, non-technique content)."""
    text = f"{title} {description}".lower()

    # Skip match footage, recaps, highlights
    skip_keywords = [
        'match', 'tournament', 'finals', 'semifinal', 'highlights',
        'vlog', 'podcast', 'interview', 'recap', 'commentary',
        'freestyle', 'greco', 'sumo', 'jiu jitsu', 'judo',
        'mma', 'ufc', 'arm wrestling'
    ]
    if any(kw in text for kw in skip_keywords):
        return False

    # Must contain instruction keywords
    instruction_keywords = [
        'technique', 'tutorial', 'instruction', 'how to', 'drill',
        'teaching', 'learn', 'tips', 'basics', 'fundamental', 'wrestling'
    ]
    if not any(kw in text for kw in instruction_keywords):
        return False

    # Filter by duration (must be between 1 and 30 minutes)
    if duration and (duration < 60 or duration > 1800):
        return False

    return True

# ─── Main Crawler ─────────────────────────────────────────────────────────────

def crawl(max_per_query=5, dry_run=False):
    """Main crawl function. Searches YouTube for wrestling videos and indexes them."""
    print(f"\n🤼 Wrestling Video Crawler Starting...")
    print(f"   Queries: {len(SEARCH_QUERIES)}")
    print(f"   Max per query: {max_per_query}")
    print(f"   Dry run: {dry_run}\n")

    ydl_opts = {
        'quiet': True,
        'extract_flat': True,
        'skip_download': True,
    }

    added = 0
    skipped = 0
    existing = 0

    with app.app_context():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            for query in SEARCH_QUERIES:
                print(f"🔍 Searching: {query}")
                try:
                    url = f"ytsearch{max_per_query}:{query}"
                    results = ydl.extract_info(url, download=False)

                    if not results or 'entries' not in results:
                        continue

                    for entry in results['entries']:
                        if not entry:
                            continue

                        video_id = entry.get('id')
                        title = entry.get('title', '')
                        description = entry.get('description', '')
                        channel = entry.get('channel', entry.get('uploader', ''))
                        duration = entry.get('duration')
                        views = entry.get('view_count', 0)
                        thumbnail = entry.get('thumbnail', f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg")

                        # Skip if already in DB
                        if Video.query.filter_by(youtube_id=video_id).first():
                            existing += 1
                            continue

                        # Relevance filter
                        if not is_relevant(title, description or '', duration):
                            skipped += 1
                            print(f"   ⏭  Skipped: {title[:60]}")
                            continue

                        # Auto-tag
                        tags = tag_video(title, description or '', channel)

                        if dry_run:
                            print(f"   ✅ Would add: {title[:60]}")
                            print(f"      Move: {tags['move_type']} | Pos: {tags['position']} | Diff: {tags['difficulty']}")
                            added += 1
                            continue

                        # Add to DB
                        video = Video(
                            youtube_id=video_id,
                            title=title,
                            description=(description or '')[:2000],
                            channel=channel,
                            duration=duration,
                            views=views,
                            thumbnail_url=thumbnail,
                            move_type=tags['move_type'],
                            position=tags['position'],
                            difficulty=tags['difficulty'],
                            age_group=tags['age_group'],
                            style=tags['style'],
                            tags=tags['tags'],
                            source_type='youtube',
                            indexed_at=datetime.utcnow()
                        )
                        db.session.add(video)
                        db.session.commit()
                        added += 1
                        print(f"   ✅ Added: {title[:60]}")

                except Exception as e:
                    print(f"   ❌ Error on query '{query}': {e}")
                    continue

    print(f"\n✅ Crawl complete!")
    print(f"   Added:    {added}")
    print(f"   Skipped:  {skipped}")
    print(f"   Existing: {existing}")

if __name__ == '__main__':
    dry_run = '--dry-run' in sys.argv
    max_per_query = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--max=')), 5))
    crawl(max_per_query=max_per_query, dry_run=dry_run)
