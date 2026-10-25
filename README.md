# Clovercut Audio API

Local API for music **and sound effects** from the current YouTube Studio Audio
Library, integrated with the Clovercut desktop provider. It runs locally; no
VPS is required. The desktop packages currently require this companion service
to be installed and running separately.

The initial live sync on 2026-10-25 collected **7,053 music tracks and 2,021 sound
effects**. Both types were downloaded through the API and decoded as MP3. These
counts describe that sync, not a fixed or guaranteed upstream inventory.

## Run

Requires Node.js 22.4 or newer and Chromium. There are no npm dependencies.

Start an interactive sign-in once:

```sh
npm run login
```

Sign in yourself and open **Audio Library**. Close that browser window when
finished. The session stays in a dedicated local profile; credentials are not
exported to the catalogue or API. Then connect, synchronize and start the service:

```sh
npm run connect
npm run sync
npm start
```

The service restores the authenticated profile in a **headless browser** when
needed. It reconnects after the visible window closes and after a service restart,
without requiring that window to remain open. Google can expire or revoke a
session; run `npm run login` again when sign-in is required. This command switches
only the dedicated browser from background operation to interactive sign-in.
It never closes an unrelated browser.

Chromium, Chrome or Edge is detected from the system. `CLOVERCUT_CHROMIUM` can
specify the executable. `CLOVERCUT_STUDIO_PROFILE` can select an existing dedicated
profile; the default is `data/browser-profile`. Use the same profile setting for
login, connection, synchronization and the server. Do not use your everyday
browser profile. The connector currently recognizes Portuguese/English preview
controls. The browser debug endpoint stays on `127.0.0.1:9223`.

The API listens only on `http://127.0.0.1:8917`. `PORT` can select another local
port. The default catalogue is `data/catalogue.json`. Sync follows continuation
tokens until exhaustion; Studio's approximate total is not used as a stopping
condition. A failed or incomplete sync preserves the previous catalogue.
Restart the API after syncing to load the new snapshot.

`npm run connect -- --reconnect` explicitly refreshes the connection. It reloads
only the Audio Library tab and briefly triggers its normal preview request,
stopping playback. Normal requests perform this recovery automatically.
Authentication stays in the browser; this project does not read cookies,
export login headers, or store credentials in its catalogue. The API exposes
read operations only and rejects unrelated browser origins and Host headers.

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
expired audio requires a valid session in the managed local browser. An expired
or unavailable session returns
503; the server does not substitute an old broken download URL. Unexpected or
expired audio hosts are rejected. Audio files are not bundled or rehosted.
The local catalogue and research artifacts are excluded from Git.

The Studio calls are internal (`creator_music/list_tracks` and `get_tracks`),
not a supported public YouTube Data API contract. A change to Studio may require
updating the connector. The Clovercut desktop provider now integrates music and sound effects through
this API, including search, pagination, licence information and credit copying.
Hosting and unattended renewal remain follow-up work; do not expose the debug port or this
local development server publicly.

## Verification

```sh
npm test
```

Twelve tests cover automatic background session recovery, startup failure,
concurrent recovery, bounded full-file downloads, metadata normalization, licences, filtering, pagination,
stalled syncs, local HTTP access, expiry renewal, concurrent requests and offline
behaviour. Live checks additionally downloaded one music track and one sound
effect from the current Studio catalogue and inspected the resulting MP3 files.
The connector was re-established from a reload before the final sync.

Source code: AGPL-3.0-or-later; upstream audio retains its own licence.

## Background recovery verification

On 2026-10-25, the visible Studio browser was closed and the API restarted.
The saved local session was restored in a managed headless Chromium in seven
seconds. Country Music returned a current audio URL and valid MP3 bytes without
a visible browser. Its complete 4,577,944-byte MP3 downloaded in under a second
with the explicit full-file range; unbounded requests had stalled. No account
credentials or signed download URLs are included in these records.
