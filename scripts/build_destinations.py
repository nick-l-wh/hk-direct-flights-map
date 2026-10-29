#!/usr/bin/env python3
"""Join the HKG passenger destination table to OurAirports coordinates.

The route table is the Wikipedia "Hong Kong International Airport" passenger
destinations compilation dated 29 October 2026 (146 cities / 152 airports).
Lat/lon, English airport name, and ICAO come from OurAirports airports.csv
matched on IATA code. Coordinates are never invented.

Usage:
  python3 scripts/build_destinations.py --airports /path/to/airports.csv
  python3 scripts/build_destinations.py --airports airports.csv --routes scripts/routes_source.json
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROUTES = Path(__file__).resolve().parent / "routes_source.json"
DEFAULT_OUT = ROOT / "data" / "destinations.json"

# cityEn -> IATA. Multi-airport cities use the airport named in the source table.
# Phnom Penh is Techo (KTI): OurAirports marks former PNH scheduled_service=no.
# Ulaanbaatar is Chinggis Khaan (UBN): former ULN scheduled_service=no.
IATA = {
    "Addis Ababa": "ADD",
    "Johannesburg–O. R. Tambo": "JNB",
    "Beijing–Capital": "PEK",
    "Beijing–Daxing": "PKX",
    "Changchun": "CGQ",
    "Changsha": "CSX",
    "Changzhou": "CZX",
    "Chengdu–Shuangliu": "CTU",
    "Chengdu–Tianfu": "TFU",
    "Chongqing": "CKG",
    "Dalian": "DLC",
    "Datong": "DAT",
    "Dunhuang": "DNH",
    "Enshi": "ENH",
    "Fuzhou": "FOC",
    "Guangzhou": "CAN",
    "Guilin": "KWL",
    "Haikou": "HAK",
    "Hailar": "HLD",
    "Hangzhou": "HGH",
    "Harbin": "HRB",
    "Hefei": "HFE",
    "Hohhot": "HET",
    "Jinan": "TNA",
    "Kunming": "KMG",
    "Lanzhou": "LHW",
    "Lhasa": "LXA",
    "Lijiang": "LJG",
    "Nanjing": "NKG",
    "Nanning": "NNG",
    "Ningbo": "NGB",
    "Qingdao": "TAO",
    "Sanya": "SYX",
    "Shanghai–Hongqiao": "SHA",
    "Shanghai–Pudong": "PVG",
    "Shenyang": "SHE",
    "Shijiazhuang": "SJW",
    "Taiyuan": "TYN",
    "Tianjin": "TSN",
    "Wenzhou": "WNZ",
    "Wuhan": "WUH",
    "Wuxi": "WUX",
    "Xi'an": "XIY",
    "Xiamen": "XMN",
    "Xining": "XNN",
    "Xuzhou": "XUZ",
    "Yichang": "YIH",
    "Yinchuan": "INC",
    "Yiwu": "YIW",
    "Yuncheng": "YCU",
    "Zhangjiajie": "DYG",
    "Zhengzhou": "CGO",
    "Zhoushan": "HSN",
    "Ürümqi": "URC",
    "Amsterdam": "AMS",
    "Barcelona": "BCN",
    "Brussels": "BRU",
    "Frankfurt": "FRA",
    "Helsinki": "HEL",
    "London–Heathrow": "LHR",
    "Madrid": "MAD",
    "Manchester": "MAN",
    "Milan–Malpensa": "MXP",
    "Moscow–Sheremetyevo": "SVO",
    "Munich": "MUC",
    "Paris–Charles de Gaulle": "CDG",
    "Rome–Fiumicino": "FCO",
    "Zurich": "ZRH",
    "Fukuoka": "FUK",
    "Hiroshima": "HIJ",
    "Ishigaki": "ISG",
    "Komatsu": "KMQ",
    "Nagoya–Centrair": "NGO",
    "Naha": "OKA",
    "Osaka–Kansai": "KIX",
    "Sapporo–Chitose": "CTS",
    "Sendai": "SDJ",
    "Shimojishima": "SHI",
    "Takamatsu": "TAK",
    "Tokyo–Haneda": "HND",
    "Tokyo–Narita": "NRT",
    "Busan": "PUS",
    "Cheongju": "CJJ",
    "Daegu": "TAE",
    "Jeju": "CJU",
    "Seoul–Incheon": "ICN",
    "Abu Dhabi": "AUH",
    "Doha": "DOH",
    "Dubai–International": "DXB",
    "Istanbul": "IST",
    "Riyadh": "RUH",
    "Boston": "BOS",
    "Chicago–O'Hare": "ORD",
    "Dallas/Fort Worth": "DFW",
    "Los Angeles": "LAX",
    "New York–JFK": "JFK",
    "San Francisco": "SFO",
    "Seattle/Tacoma": "SEA",
    "Toronto–Pearson": "YYZ",
    "Vancouver": "YVR",
    "Almaty": "ALA",
    "Ulaanbaatar": "UBN",
    "Adelaide": "ADL",
    "Auckland": "AKL",
    "Brisbane": "BNE",
    "Christchurch": "CHC",
    "Koror": "ROR",
    "Melbourne": "MEL",
    "Nadi": "NAN",
    "Perth": "PER",
    "Port Moresby": "POM",
    "Saipan": "SPN",
    "Sydney–Kingsford Smith": "SYD",
    "Bengaluru": "BLR",
    "Chennai": "MAA",
    "Colombo–Bandaranaike": "CMB",
    "Delhi–Indira Gandhi": "DEL",
    "Dhaka": "DAC",
    "Hyderabad": "HYD",
    "Kathmandu": "KTM",
    "Malé": "MLE",
    "Mumbai–Shivaji": "BOM",
    "Bandar Seri Begawan": "BWN",
    "Bangkok–Don Mueang": "DMK",
    "Bangkok–Suvarnabhumi": "BKK",
    "Cebu": "CEB",
    "Chiang Mai": "CNX",
    "Clark": "CRK",
    "Da Nang": "DAD",
    "Davao": "DVO",
    "Denpasar": "DPS",
    "Hanoi": "HAN",
    "Ho Chi Minh City": "SGN",
    "Iloilo": "ILO",
    "Jakarta–Soekarno-Hatta": "CGK",
    "Koh Samui": "USM",
    "Kota Kinabalu": "BKI",
    "Kuala Lumpur": "KUL",
    "Kuala Lumpur–Subang": "SZB",
    "Manila": "MNL",
    "Nha Trang": "CXR",
    "Penang": "PEN",
    "Phnom Penh": "KTI",
    "Phu Quoc": "PQC",
    "Phuket": "HKT",
    "Singapore": "SIN",
    "Surabaya": "SUB",
    "Tawau": "TWU",
    "Vientiane": "VTE",
    "Kaohsiung": "KHH",
    "Taichung": "RMQ",
    "Taipei–Taoyuan": "TPE",
}

# Extra name fragments for airports whose common city label is not in the
# OurAirports name or municipality (closed-field replacements, accented names).
ALIASES = {
    "Koror": ["tmetuchl", "babelthuap"],
    "Zurich": ["zürich", "zurich"],
    "Istanbul": ["stanbul"],
    "Nagoya–Centrair": ["centrair"],
    "Phnom Penh": ["techo", "phnom"],
    "Ulaanbaatar": ["chinggis", "ulaanbaatar"],
    "Nha Trang": ["cam ranh", "nha trang"],
    "Phu Quoc": ["phu quoc", "quốc"],
    "Wuxi": ["wuxi", "shuofang"],
    "Qingdao": ["qingdao", "jiaodong"],
    "Xi'an": ["xi'an", "xianyang"],
    "Ürümqi": ["ürümqi", "rümqi"],
    "Malé": ["malé", "velana"],
    "Ho Chi Minh City": ["ho chi minh", "tan son"],
    "Busan": ["busan", "gimhae"],
    "Abu Dhabi": ["abu dhabi", "zayed"],
    "Doha": ["doha", "hamad"],
    "Kuala Lumpur–Subang": ["subang", "aziz"],
}

REGIONS = [
    {"id": "CN", "zh": "中國內地"},
    {"id": "TW", "zh": "台灣／澳門"},
    {"id": "JP", "zh": "日本"},
    {"id": "KR", "zh": "韓國"},
    {"id": "SEA", "zh": "東南亞"},
    {"id": "SA", "zh": "南亞"},
    {"id": "ME", "zh": "中東"},
    {"id": "EU", "zh": "歐洲"},
    {"id": "NA", "zh": "北美"},
    {"id": "OC", "zh": "大洋洲"},
    {"id": "AF", "zh": "非洲"},
    {"id": "OA", "zh": "其他亞洲（中亞／蒙古）"},
]
REGION_ZH = {r["id"]: r["zh"] for r in REGIONS}
REGION_ORDER = {r["id"]: i for i, r in enumerate(REGIONS)}

NOTE_RE = re.compile(r"^(.+?)（(.+)）$")
CANVAS_ROW_RE = re.compile(
    r'\["((?:[^"\\]|\\.)*)","((?:[^"\\]|\\.)*)","((?:[^"\\]|\\.)*)","((?:[^"\\]|\\.)*)"\]'
)


def parse_airlines(raw: str) -> list[dict]:
    airlines = []
    for part in raw.split("、"):
        part = part.strip()
        match = NOTE_RE.match(part)
        if match:
            name, note = match.group(1).strip(), match.group(2).strip()
        else:
            name, note = part, None
        tags = []
        if note:
            if "暫停" in note:
                tags.append("暫停")
            if "開航" in note:
                tags.append("新開航")
            if "復航" in note:
                tags.append("復航")
            if "季節性" in note:
                tags.append("季節性")
        airlines.append({"name": name, "note": note, "tags": tags})
    return airlines


def city_key(city_en: str) -> str:
    return city_en.split("–")[0].strip()


def load_routes_from_canvas(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"const D: string\[\]\[\] = \[(.*)\];\n", text, re.S)
    if not match:
        sys.exit(f"could not find destination array in {path}")
    rows = []
    for region, city_zh, city_en, airlines in CANVAS_ROW_RE.findall(match.group(1)):
        rows.append(
            {
                "region": region,
                "cityZh": city_zh,
                "cityEn": city_en,
                "airlinesRaw": airlines,
            }
        )
    return rows


def load_routes(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["routes"]


def index_airports(path: Path) -> dict[str, dict]:
    by_iata: dict[str, list[dict]] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            code = (row.get("iata_code") or "").strip()
            if not code:
                continue
            by_iata.setdefault(code, []).append(row)
    return by_iata


def choose_airport(code: str, rows: list[dict]) -> dict:
    eligible = [
        row
        for row in rows
        if row.get("type") in {"large_airport", "medium_airport"}
        and row.get("scheduled_service") == "yes"
    ]
    if len(eligible) != 1:
        summary = [
            f"{row.get('ident')} {row.get('type')} sched={row.get('scheduled_service')} {row.get('name')}"
            for row in rows
        ]
        sys.exit(f"{code}: expected one scheduled large/medium airport, found {summary}")
    return eligible[0]


def blob(row: dict) -> str:
    return f"{row.get('name', '')} {row.get('municipality', '')}".casefold()


def tokens_for(city_en: str) -> list[str]:
    if city_en in ALIASES:
        return ALIASES[city_en]
    raw = city_en.replace("–", " ").replace("-", " ").replace("/", " ").replace("'", "")
    stop = {"international", "airport", "city", "fort"}
    return [part.casefold() for part in raw.split() if len(part) >= 4 and part.casefold() not in stop]


def assert_name_match(city_en: str, row: dict) -> None:
    haystack = blob(row)
    keys = tokens_for(city_en)
    if not any(key.casefold() in haystack for key in keys):
        sys.exit(
            f"name check failed for {city_en} ({row.get('iata_code')}): "
            f"{row.get('name')} | {row.get('municipality')} | looked for {keys}"
        )


def round6(value: str) -> float:
    return round(float(value), 6)


def build(routes: list[dict], airports_path: Path) -> dict:
    if len(routes) != 152:
        sys.exit(f"expected 152 route rows, found {len(routes)}")
    missing = [row["cityEn"] for row in routes if row["cityEn"] not in IATA]
    extra = sorted(set(IATA) - {row["cityEn"] for row in routes})
    if missing or extra:
        sys.exit(f"IATA map mismatch. missing={missing} extra={extra}")
    codes = [IATA[row["cityEn"]] for row in routes]
    dupes = [code for code, count in Counter(codes).items() if count > 1]
    if dupes:
        sys.exit(f"duplicate IATA codes: {dupes}")

    digest = hashlib.sha256(airports_path.read_bytes()).hexdigest()
    by_iata = index_airports(airports_path)
    origin_row = choose_airport("HKG", by_iata.get("HKG", []))
    assert_name_match_origin(origin_row)

    destinations = []
    for row in routes:
        code = IATA[row["cityEn"]]
        airport = choose_airport(code, by_iata.get(code, []))
        assert_name_match(row["cityEn"], airport)
        if row["region"] not in REGION_ZH:
            sys.exit(f"unknown region {row['region']} for {row['cityEn']}")
        airlines = parse_airlines(row["airlinesRaw"])
        if not airlines or any(not item["name"] for item in airlines):
            sys.exit(f"bad airlines for {row['cityEn']}: {row['airlinesRaw']}")
        notes = [f"{item['name']}：{item['note']}" for item in airlines if item["note"]]
        destinations.append(
            {
                "iata": code,
                "icao": airport.get("icao_code") or None,
                "ourAirportsId": airport.get("ident"),
                "cityZh": row["cityZh"],
                "cityEn": row["cityEn"],
                "cityKey": city_key(row["cityEn"]),
                "airportName": airport.get("name"),
                "municipality": airport.get("municipality"),
                "country": airport.get("iso_country"),
                "region": row["region"],
                "regionZh": REGION_ZH[row["region"]],
                "lat": round6(airport["latitude_deg"]),
                "lon": round6(airport["longitude_deg"]),
                "airlines": airlines,
                "notes": notes,
                "airlinesRaw": row["airlinesRaw"],
            }
        )

    destinations.sort(key=lambda item: (REGION_ORDER[item["region"]], item["cityEn"].casefold()))
    city_count = len({item["cityKey"] for item in destinations})
    if city_count != 146:
        grouped = Counter(item["cityKey"] for item in destinations)
        sys.exit(f"expected 146 cities, found {city_count}: {[k for k, v in grouped.items() if v > 1]}")

    origin_lat = round6(origin_row["latitude_deg"])
    origin_lon = round6(origin_row["longitude_deg"])
    if not (22.2 < origin_lat < 22.4 and 113.8 < origin_lon < 114.0):
        sys.exit(f"unexpected HKG coordinates {origin_lat}, {origin_lon}")

    return {
        "meta": {
            "asOf": "2026-10-29",
            "asOfLabel": "2026年10月29日",
            "cityCount": city_count,
            "airportCount": len(destinations),
            "origin": {
                "iata": "HKG",
                "icao": origin_row.get("icao_code"),
                "ourAirportsId": origin_row.get("ident"),
                "cityZh": "香港",
                "cityEn": "Hong Kong",
                "airportName": origin_row.get("name"),
                "lat": origin_lat,
                "lon": origin_lon,
            },
            "regions": REGIONS,
            "sources": [
                {
                    "role": "destinations",
                    "name": "Wikipedia — Hong Kong International Airport — Airlines and destinations",
                    "url": "https://en.wikipedia.org/wiki/Hong_Kong_International_Airport#Airlines_and_destinations",
                    "note": "客運直航航點、航空公司及季節性／新開航／暫停備註取自該頁航點表，整理截至 2026年10月29日（維基百科引用資料存取日期 2026-10-17）。不包括貨運。航空公司名稱保留英文。",
                },
                {
                    "role": "coordinates",
                    "name": "OurAirports",
                    "url": "https://ourairports.com/data/",
                    "note": "緯度、經度、英文機場名稱及 ICAO 以 IATA 代碼對照 OurAirports airports.csv，只採用 scheduled_service 為 yes 的 large_airport 或 medium_airport。金邊為 Techo International Airport（KTI／VDTI）；舊碼 PNH 已無定期航班。烏蘭巴托為 Chinggis Khaan International Airport（UBN／ZMCK）；舊碼 ULN 已無定期航班。",
                    "airportsCsvSha256": digest,
                },
            ],
            "macauNote": "澳門與香港之間沒有定期客運航班，因此「台灣／澳門」只列出台灣航點。",
        },
        "destinations": destinations,
    }


def assert_name_match_origin(row: dict) -> None:
    if "hong kong" not in blob(row):
        sys.exit(f"HKG name check failed: {row.get('name')} | {row.get('municipality')}")


def extract_canvas(canvas: Path, routes_out: Path) -> list[dict]:
    routes = load_routes_from_canvas(canvas)
    payload = {
        "description": "Passenger nonstop destinations from HKG, extracted from the Wikipedia destination table compilation dated 2026-10-29. Airlines keep parenthetical seasonal/new/suspended notes.",
        "routes": routes,
    }
    routes_out.parent.mkdir(parents=True, exist_ok=True)
    routes_out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return routes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--airports", required=True, type=Path, help="OurAirports airports.csv")
    parser.add_argument("--routes", type=Path, default=DEFAULT_ROUTES)
    parser.add_argument("--canvas", type=Path, help="Optional canvas export to refresh routes_source.json")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    if args.canvas:
        routes = extract_canvas(args.canvas, args.routes)
    else:
        routes = load_routes(args.routes)

    payload = build(routes, args.airports)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    noted = [d for d in payload["destinations"] if d["notes"]]
    print(f"wrote {args.out} airports={payload['meta']['airportCount']} cities={payload['meta']['cityCount']} with_notes={len(noted)}")
    for item in noted:
        print(f"  {item['iata']} {item['cityZh']}: {'; '.join(item['notes'])}")


if __name__ == "__main__":
    main()
