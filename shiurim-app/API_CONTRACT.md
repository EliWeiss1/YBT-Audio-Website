# Shiurim Library — Public API Contract

**Base URL:** `https://<your-domain>.vercel.app`  
**Authentication:** None required for data endpoints (public, read-only).  
**Rate limit:** Please keep requests under 60/minute. Responses are cached at the CDN — repeating the same request within 60 seconds returns the cached result instantly and costs nothing.  
**Format:** All responses are `application/json`. All errors follow `{ "error": "message" }` with an appropriate HTTP status code.

---

## Endpoints

### 1. List / Search Lectures

```
GET /api/v1/lectures
```

Returns a paginated list of lectures, optionally filtered.

#### Query Parameters

| Parameter  | Type   | Default | Description |
|------------|--------|---------|-------------|
| `speaker`  | string | —       | Filter by speaker name (case-insensitive partial match against canonical name). Speaker names are normalized — e.g. `speaker=Chait` matches lectures by "Rabbi Yisroel Chait" and all other variants grouped under "Rabbi Chait". Use the canonical names returned by `GET /api/v1/categories` or browse `/api/v1/lectures` to discover available speakers. |
| `category` | string | —       | Filter by category or subcategory label (case-insensitive exact match against any level of the breadcrumb). E.g. `category=Gemarah` or `category=Bava Kamma`. Also accepts subcategory node IDs. |
| `tag`      | string | —       | Filter by tag (case-insensitive exact match). E.g. `tag=bereishis`. |
| `search`   | string | —       | Partial text match on lecture title (case-insensitive). E.g. `search=genesis`. |
| `date_from`| string | —       | Only return lectures on or after this date. Format: `YYYY-MM-DD`. |
| `date_to`  | string | —       | Only return lectures on or before this date. Format: `YYYY-MM-DD`. |
| `limit`    | number | `20`    | Number of results per page. Min: 1, Max: 100. |
| `offset`   | number | `0`     | Number of results to skip (for pagination). |

Filters are ANDed together — you can combine any of them.

#### Response

```json
{
  "total": 150,
  "offset": 0,
  "limit": 20,
  "results": [
    {
      "id": "BN-9293",
      "title": "Genesis 25 (Set 1)",
      "speaker": "Rabbi Chait",
      "date": "1992-12-02",
      "duration": 3600,
      "description": "",
      "tags": ["bnei noach", "bereishis"],
      "audioUrl": "https://cdn.example.com/audio/BN-9293.mp3",
      "breadcrumb": ["Chumash", "Bereishit"],
      "nodeId": "bereishit-noach"
    }
  ]
}
```

#### Response Fields

| Field        | Type       | Description |
|--------------|------------|-------------|
| `total`      | number     | Total number of lectures matching the filters (before pagination). |
| `offset`     | number     | The offset used for this page. |
| `limit`      | number     | The limit used for this page. |
| `results`    | array      | Array of lecture objects for this page. |
| `id`         | string     | Unique lecture identifier. |
| `title`      | string     | Lecture title. |
| `speaker`    | string     | Speaker name. |
| `date`       | string     | Recording date in `YYYY-MM-DD` format. |
| `duration`   | number     | Duration in seconds. |
| `description`| string     | Description (may be empty). |
| `tags`       | string[]   | Topic tags. |
| `audioUrl`   | string     | Direct URL to the MP3 audio file. |
| `breadcrumb` | string[]   | Category path from root, e.g. `["Gemarah", "Bava Kamma"]`. |
| `nodeId`     | string     | ID of the subcategory node that contains this lecture. |

#### Pagination

Use `limit` and `offset` together to page through results:

- Page 1: `?limit=50&offset=0`
- Page 2: `?limit=50&offset=50`
- Page 3: `?limit=50&offset=100`

When `offset >= total`, `results` will be an empty array.

#### Examples

```bash
# All lectures (first 20)
GET /api/v1/lectures

# Filter by speaker
GET /api/v1/lectures?speaker=Berkowitz&limit=50

# Filter by top-level category
GET /api/v1/lectures?category=Halacha

# Filter by subcategory
GET /api/v1/lectures?category=Bava Kamma

# Search by title
GET /api/v1/lectures?search=shabbos&limit=10

# Date range
GET /api/v1/lectures?date_from=2000-01-01&date_to=2010-12-31

# Combined: lectures by a speaker in a category since 2005
GET /api/v1/lectures?speaker=Chait&category=Chumash&date_from=2005-01-01

# Fetch all lectures (paginate through entire catalog)
GET /api/v1/lectures?limit=100&offset=0
GET /api/v1/lectures?limit=100&offset=100
# ...repeat until results array is empty
```

---

### 2. Get Single Lecture

```
GET /api/v1/lectures/:id
```

Returns a single lecture by its ID.

#### Path Parameter

| Parameter | Description |
|-----------|-------------|
| `id`      | The lecture's unique ID (e.g. `BN-9293`). |

#### Response (200)

Same object shape as a single item in the list endpoint's `results` array — includes all fields including `audioUrl`.

#### Response (404)

```json
{ "error": "Not found" }
```

#### Example

```bash
GET /api/v1/lectures/BN-9293
```

---

### 3. Get Category Tree

```
GET /api/v1/categories
```

Returns the full category hierarchy (without embedded lectures — use the lectures endpoint to query by category).

#### Response

```json
{
  "categories": [
    {
      "id": "gemarah",
      "label": "Gemarah",
      "icon": "📜",
      "children": [
        {
          "id": "bava-kamma",
          "label": "Bava Kamma"
        },
        {
          "id": "bava-metzia",
          "label": "Bava Metzia",
          "children": [...]
        }
      ]
    },
    {
      "id": "chumash",
      "label": "Chumash",
      "icon": "📖",
      "children": [...]
    }
  ]
}
```

#### Response Fields

| Field      | Type     | Description |
|------------|----------|-------------|
| `id`       | string   | Node ID. Use this value in the `category` param of the lectures endpoint. |
| `label`    | string   | Display name. Also accepted by the `category` param. |
| `icon`     | string?  | Emoji icon (top-level categories only). May be absent. |
| `children` | array?   | Child nodes. Absent for leaf nodes. |

This response is cached for 5 minutes at the CDN.

#### Example

```bash
GET /api/v1/categories
```

---

## Error Responses

| Status | When |
|--------|------|
| `400`  | Invalid query parameter (e.g. `limit=200`, malformed date). |
| `404`  | Lecture ID not found. |
| `401`  | Stats endpoint called without a valid key. |
| `500`  | Server error. |

All errors return `{ "error": "<description>" }`.

---

## Catalog Size

As of the contract date, the catalog contains approximately **19,657 lectures** across **13 top-level categories**. Use `GET /api/v1/lectures` with no filters to get the total count (`total` field).

---

## Notes

- `audioUrl` is a direct CDN link to the MP3 file. It can be played or downloaded directly.
- `duration` is in seconds. To format: `Math.floor(duration/3600)` hours, etc.
- `date` fields are `YYYY-MM-DD` strings and sort lexicographically.
- All text filtering is case-insensitive.
- The API is read-only. No write operations are exposed.
