import sqlite3
import os

def upgrade_database():
    # Lấy đường dẫn của thư mục chứa file script hiện tại
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Nối với tên file db (vì seal.db nằm cùng thư mục với update_db.py)
    db_path = os.path.join(current_dir, 'seal.db')
    
    print(f"📂 Đang kết nối tới: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Lệnh thêm cột
        cursor.execute("ALTER TABLE sealed_records ADD COLUMN parent_hash TEXT DEFAULT NULL")
        conn.commit()
        print("✅ Đã thêm cột parent_hash thành công!")
        
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print("⚠️ Cột parent_hash đã tồn tại rồi.")
        else:
            print(f"❌ Lỗi hệ thống: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    upgrade_database()