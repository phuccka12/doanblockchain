import sqlite3

conn = sqlite3.connect('seal.db')

# Xem trạng thái trước
rows_before = conn.execute('SELECT sha256, watermark_id, registrant_name, registered FROM sealed_records').fetchall()
print(f'Trước khi xóa: {len(rows_before)} records')
for r in rows_before:
    print(f'  sha={r[0][:24]}... wm={r[1]} name={r[2]} registered={r[3]}')

# Xóa TẤT CẢ record có registered=0 (chưa lên chain - an toàn để xóa)
# Chỉ giữ lại những record đã registered=1 (đã mint NFT on-chain)
deleted = conn.execute("DELETE FROM sealed_records WHERE registered = 0").rowcount
conn.commit()

rows_after = conn.execute('SELECT sha256, watermark_id, registrant_name, registered FROM sealed_records').fetchall()
print(f'\nĐã xóa {deleted} record chưa đăng ký on-chain.')
print(f'Sau khi xóa: {len(rows_after)} records còn lại (toàn bộ đã registered=1)')
for r in rows_after:
    print(f'  sha={r[0][:24]}... wm={r[1]} name={r[2]} registered={r[3]}')

conn.close()
print('\nDone. Bạn có thể seal lại ảnh bây giờ!')
