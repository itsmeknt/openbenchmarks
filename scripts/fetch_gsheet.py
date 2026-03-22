from __future__ import annotations

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast, TypedDict


type JsonPrimitive = str | int | float | bool | None
type JsonValue = JsonPrimitive | list["JsonValue"] | dict[str, "JsonValue"]


class SpreadsheetProperties(TypedDict, total=False):
    title: str


class SheetProperties(TypedDict, total=False):
    sheetId: int
    index: int
    title: str


class MetadataSheetEntry(TypedDict, total=False):
    properties: SheetProperties


class SpreadsheetMetadataResponse(TypedDict, total=False):
    properties: SpreadsheetProperties
    sheets: list[MetadataSheetEntry]


class ValueRangeResponse(TypedDict, total=False):
    range: str
    values: list[list[JsonValue]]


class BatchGetValuesResponse(TypedDict, total=False):
    spreadsheetId: str
    valueRanges: list[ValueRangeResponse]


class ColumnDef(TypedDict):
    key: str
    label: str


class SheetPayload(TypedDict):
    sheetId: int | None
    index: int | None
    title: str
    columns: list[ColumnDef]
    rows: list[list[JsonValue | None]]
    items: list[dict[str, JsonValue | None]]
    rowCount: int


class OutputPayload(TypedDict):
    fetchedAt: str
    spreadsheetId: str
    spreadsheetTitle: str | None
    sheetOrder: list[str]
    sheetCount: int
    sheets: dict[str, SheetPayload]


def require_env(name: str) -> str:
    value: str = os.getenv(name, "").strip()
    if not value:
        print(f"Missing required environment variable: {name}", file=sys.stderr)
        sys.exit(1)
    return value


def api_get_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "github-actions-google-sheets-fetcher/1.0",
        },
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        body: str = response.read().decode("utf-8")
        data: Any = json.loads(body)

    if not isinstance(data, dict):
        raise ValueError("Expected JSON object response from API.")

    return cast(dict[str, Any], data)


def sanitize_headers(headers: list[JsonValue]) -> list[str]:
    used: dict[str, int] = {}
    output: list[str] = []

    for idx, raw in enumerate(headers, start=1):
        text: str = str(raw).strip()
        key: str = re.sub(r"[^a-zA-Z0-9]+", "_", text.lower()).strip("_")

        if not key:
            key = f"column_{idx}"

        if key in used:
            used[key] += 1
            key = f"{key}_{used[key]}"
        else:
            used[key] = 1

        output.append(key)

    return output


def quote_sheet_title_for_a1(title: str) -> str:
    escaped: str = title.replace("'", "''")
    return f"'{escaped}'"


def fetch_spreadsheet_metadata(
    spreadsheet_id: str,
    api_key: str,
) -> SpreadsheetMetadataResponse:
    params: str = urllib.parse.urlencode(
        {
            "key": api_key,
            "includeGridData": "false",
        }
    )
    url: str = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}?{params}"
    response: dict[str, Any] = api_get_json(url)
    return response    # pyright: ignore[reportReturnType]


def fetch_all_sheet_values(
    spreadsheet_id: str,
    sheet_titles: list[str],
    api_key: str,
) -> BatchGetValuesResponse:
    ranges: list[str] = [quote_sheet_title_for_a1(title) for title in sheet_titles]

    query_items: list[tuple[str, str]] = [
        ("key", api_key),
        ("majorDimension", "ROWS"),
        ("valueRenderOption", "UNFORMATTED_VALUE"),
        ("dateTimeRenderOption", "FORMATTED_STRING"),
    ]
    query_items.extend(("ranges", sheet_range) for sheet_range in ranges)

    params: str = urllib.parse.urlencode(query_items, doseq=True)
    url: str = (
        f"https://sheets.googleapis.com/v4/spreadsheets/"
        f"{spreadsheet_id}/values:batchGet?{params}"
    )

    response: dict[str, Any] = api_get_json(url)
    return response    # pyright: ignore[reportReturnType]


def build_sheet_payload(values: list[list[JsonValue]]) -> SheetPayload:
    if not values:
        return {
            "sheetId": None,
            "index": None,
            "title": "",
            "columns": [],
            "rows": [],
            "items": [],
            "rowCount": 0,
        }

    header_row: list[JsonValue] = values[0]
    data_rows: list[list[JsonValue]] = values[1:]

    keys: list[str] = sanitize_headers(header_row)
    columns: list[ColumnDef] = [
        {"key": key, "label": str(label)}
        for key, label in zip(keys, header_row, strict=False)
    ]

    rows: list[list[JsonValue | None]] = []
    items: list[dict[str, JsonValue | None]] = []

    for row in data_rows:
        padded: list[JsonValue | None] = list(row) + [None] * (len(keys) - len(row))
        padded = padded[: len(keys)]
        rows.append(padded)
        items.append({key: value for key, value in zip(keys, padded, strict=False)})

    return {
        "sheetId": None,
        "index": None,
        "title": "",
        "columns": columns,
        "rows": rows,
        "items": items,
        "rowCount": len(items),
    }


def extract_sheet_title_from_range(range_str: str) -> str:
    raw_sheet_name: str = range_str.split("!", 1)[0].strip()

    if raw_sheet_name.startswith("'") and raw_sheet_name.endswith("'"):
        return raw_sheet_name[1:-1].replace("''", "'")

    return raw_sheet_name


def build_output(
    spreadsheet_id: str,
    metadata: SpreadsheetMetadataResponse,
    values_response: BatchGetValuesResponse,
) -> OutputPayload:
    metadata_sheets: list[MetadataSheetEntry] = metadata.get("sheets", [])
    spreadsheet_title: str | None = metadata.get("properties", {}).get("title")

    sheets_by_title: dict[str, SheetPayload] = {}
    sheet_order: list[str] = []

    for entry in metadata_sheets:
        properties: SheetProperties = entry.get("properties", {})
        title: str = properties.get("title", "")

        if not title:
            continue

        sheet_order.append(title)
        sheets_by_title[title] = {
            "sheetId": properties.get("sheetId"),
            "index": properties.get("index"),
            "title": title,
            "columns": [],
            "rows": [],
            "items": [],
            "rowCount": 0,
        }

    for value_range in values_response.get("valueRanges", []):
        range_str: str = value_range.get("range", "")
        values: list[list[JsonValue]] = value_range.get("values", [])
        sheet_title: str = extract_sheet_title_from_range(range_str)

        payload: SheetPayload = build_sheet_payload(values)

        if sheet_title not in sheets_by_title:
            sheets_by_title[sheet_title] = {
                **payload,
                "title": sheet_title,
            }
            sheet_order.append(sheet_title)
        else:
            existing: SheetPayload = sheets_by_title[sheet_title]
            existing.update(
                {
                    "columns": payload["columns"],
                    "rows": payload["rows"],
                    "items": payload["items"],
                    "rowCount": payload["rowCount"],
                }
            )

    return {
        "fetchedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "spreadsheetId": spreadsheet_id,
        "spreadsheetTitle": spreadsheet_title,
        "sheetOrder": sheet_order,
        "sheetCount": len(sheet_order),
        "sheets": sheets_by_title,
    }


def get_sheet_titles(metadata: SpreadsheetMetadataResponse) -> list[str]:
    titles: list[str] = []

    for entry in metadata.get("sheets", []):
        title: str = entry.get("properties", {}).get("title", "").strip()
        if title:
            titles.append(title)

    return titles


def write_output_file(output_path: str, payload: OutputPayload) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    _ = path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    spreadsheet_id: str = require_env("SPREADSHEET_ID")
    api_key: str = require_env("GOOGLE_SHEETS_API_KEY")
    output_path: str = require_env("OUTPUT_PATH")

    metadata: SpreadsheetMetadataResponse = fetch_spreadsheet_metadata(
        spreadsheet_id=spreadsheet_id,
        api_key=api_key,
    )

    sheet_titles: list[str] = get_sheet_titles(metadata)
    if not sheet_titles:
        print("No sheets found in spreadsheet.", file=sys.stderr)
        sys.exit(1)

    values_response: BatchGetValuesResponse = fetch_all_sheet_values(
        spreadsheet_id=spreadsheet_id,
        sheet_titles=sheet_titles,
        api_key=api_key,
    )

    output: OutputPayload = build_output(
        spreadsheet_id=spreadsheet_id,
        metadata=metadata,
        values_response=values_response,
    )

    write_output_file(output_path=output_path, payload=output)

    print(f"Wrote {output_path}")
    print(f"Fetched {len(sheet_titles)} sheet(s): {', '.join(sheet_titles)}")


if __name__ == "__main__":
    main()
