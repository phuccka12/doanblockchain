import sqlite3

conn = sqlite3.connect('seal.db')
cur = conn.cursor()
rows = cur.execute(
    'SELECT sha256, watermark_id, orig_dhash, registrant_name, registered, dhash FROM sealed_records ORDER BY created_at DESC'
).fetchall()
print(f'Total records in DB: {len(rows)}')
print()
for i, r in enumerate(rows):
    sha, wm, odh, name, reg, dh = r
    odh_preview = odh[:20] if odh else "(empty)"
    print(f'[{i+1}] sha={sha[:16]}...')
    print(f'     wm={wm}  name={name}  registered={reg}')
    print(f'     dhash={dh}')
    print(f'     orig_dhash={odh_preview}')
    print()

# Kiểm tra hamming distance giữa các orig_dhash
if len(rows) >= 2:
    print("=== So sánh orig_dhash giữa các record ===")
    for i in range(len(rows)):
        for j in range(i+1, len(rows)):
            odh1 = rows[i][2]
            odh2 = rows[j][2]
            if odh1 and odh2 and len(odh1) == len(odh2):
                dist = sum(c1 != c2 for c1, c2 in zip(odh1, odh2))
                flag = " <<< DUPLICATE!" if dist <= 4 else (" <<< WARNING (dist<=8)" if dist <= 8 else "")
                print(f'  [{i+1}] vs [{j+1}]: orig_dhash dist={dist}{flag}')

conn.close()
