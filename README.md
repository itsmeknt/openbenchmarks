

JSON data of the google spreadsheet fetch will look like this:

```json
{
  "fetchedAt": "2026-03-22T18:17:00+00:00",
  "spreadsheetId": "abc123...",
  "spreadsheetTitle": "My Spreadsheet",
  "sheetOrder": ["Summary", "Raw Data", "Config"],
  "sheetCount": 3,
  "sheets": {
    "Summary": {
      "sheetId": 0,
      "index": 0,
      "title": "Summary",
      "columns": [
        { "key": "date", "label": "Date" },
        { "key": "value", "label": "Value" }
      ],
      "rows": [
        ["2026-03-01", 10],
        ["2026-03-02", 14]
      ],
      "items": [
        { "date": "2026-03-01", "value": 10 },
        { "date": "2026-03-02", "value": 14 }
      ],
      "rowCount": 2
    },
    "Raw Data": {
      "sheetId": 123456789,
      "index": 1,
      "title": "Raw Data",
      "columns": [],
      "rows": [],
      "items": [],
      "rowCount": 0
    }
  }
}
```
