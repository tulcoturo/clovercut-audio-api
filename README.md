# Clovercut Audio API

Local API for music **and sound effects** from the current YouTube Studio Audio
Library. This is a working local prototype; it is not deployed or wired into the
Clovercut desktop provider yet.

The initial live sync on 2026-10-25 collected **7,053 music tracks and 2,021 sound
effects**. Both types were downloaded through the API and decoded as MP3. These
counts describe that sync, not a fixed or guaranteed upstream inventory.

## Run

Requires Node.js 22.4 or newer and Chromium. There are no npm dependencies.

Start a dedicated Chromium profile with remote debugging bound to loopback:

```sh
chromium --user-data-dir="$PWD/../clovercut-studio-browser" \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port=9223 \
  https://studio.youtube.com
```

Sign in yourself and open **Audio Library**. The connector currently recognizes
the Portuguese and English preview controls. Then:

```sh
npm run connect
npm run sync
npm start
```

The API listens only on `http://127.0.0.1:8917`. `PORT` can select another local
port. The default catalogue is `data/catalogue.json`. Sync follows continuation
tokens until exhaustion; Studio's approximate total is not used as a stopping
condition. A failed or incomplete sync preserves the previous catalogue.
Restart the API after syncing to load the new snapshot.

`npm run connect -- --reconnect` reconnects after a page reload or expired Studio
request. It reloads only the Audio Library tab and briefly triggers its normal
preview request, stopping playback. Keep that tab open when fresh audio URLs are
needed. Authentication stays in the browser; this project does not read cookies,
export login headers, or store credentials in its catalogue. The API exposes
read operations only and rejects unrelated browser origins and Host headers.
Close the dedicated browser when you no longer need it.

## Endpoints

- `GET /health`: catalogue timestamp and counts.
- `GET /v1/tracks`: search and pagination.
- `GET /v1/facets?type=sound-effect`: categories, genres, moods and instruments.
- `GET /v1/tracks/:id`: metadata and licence information.
- `GET /v1/tracks/:id/audio` or `/download`: resolve the current audio URL and
  redirect to Google's audio host. URLs are cached until shortly before expiry.
  Simultaneous requests for the same track share one renewal.

Search parameters:

| Parameter | Meaning |
| --- | --- |
| `type` | `music` or `sound-effect`; omit for both |
| `q` | Case-insensitive title or artist search |
| `category` | Exact category identifier from facets |
| `genre`, `mood` | Exact identifier from facets |
| `durationMin`, `durationMax` | Duration in seconds, inclusive |
| `offset` | Zero-based result offset |
| `limit` | 1–200; defaults to 50 |

```sh
curl 'http://127.0.0.1:8917/v1/tracks?type=sound-effect&q=rain&limit=10'
curl 'http://127.0.0.1:8917/v1/facets?type=music'
```

Responses include `total`, `offset`, `limit`, `nextOffset` and `items`. Category
identifiers retain Studio's stable enum values; a client should localize their
labels. Track titles and artists are source metadata rather than UI strings.

## Licences and audio availability

Records retain the source licence code. The observed YouTube standard licence
is distinguished from **CC BY 4.0**, which requires attribution. Unknown codes
have `requiresAttribution: null`; they are not assumed to be CC0 or attribution
free. Original track and artist links are preserved when provided. A missing
attribution text remains `null`; the client must not invent an official credit.
Follow the [Audio Library attribution instructions](https://support.google.com/youtube/answer/3376882)
for the relevant track.

Catalogue browsing works without Studio after sync. Resolving uncached or
expired audio requires the authenticated tab. An unavailable session returns
503; the server does not substitute an old broken download URL. Unexpected or
expired audio hosts are rejected. Audio files are not bundled or rehosted.
The local catalogue and research artifacts are excluded from Git.

The Studio calls are internal (`creator_music/list_tracks` and `get_tracks`),
not a supported public YouTube Data API contract. A change to Studio may require
updating the connector. Hosting, unattended renewal, and integration into the
desktop provider remain follow-up work; do not expose the debug port or this
local development server publicly.

## Verification

```sh
npm test
```

Eight tests cover metadata normalization, licences, filtering, pagination,
stalled syncs, local HTTP access, expiry renewal, concurrent requests and offline
behaviour. Live checks additionally downloaded one music track and one sound
effect from the current Studio catalogue and inspected the resulting MP3 files.
The connector was re-established from a reload before the final sync.

Source code: AGPL-3.0-or-later; upstream audio retains its own licence.
