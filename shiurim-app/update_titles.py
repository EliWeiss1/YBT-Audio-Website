import json, re

input_path = r"C:\Users\eliis\TTL-app\shiurim-app\data\lectures.json"
output_path = r"C:\Users\eliis\TTL-app\shiurim-app\data\lectures.json"

with open(input_path, encoding="utf-8") as f:
    data = json.load(f)

pattern = re.compile(r"^([A-Za-z]|HL|NR)-\d+$")
count = 0

def update(node):
    global count
    if "lectures" in node:
        for lec in node["lectures"]:
            if pattern.match(lec["id"]):
                suffix = f'({lec["id"]})'
                if not lec["title"].endswith(suffix):
                    lec["title"] = lec["title"] + " " + suffix
                    count += 1
    if "children" in node:
        for child in node["children"]:
            update(child)

for cat in data["categories"]:
    update(cat)

with open(output_path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"Updated {count} lecture title instances")
