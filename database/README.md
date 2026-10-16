# Roava → Supabase PostgreSQL

Angular ใช้ Supabase ผ่าน application RPCs ใน `connect-app.sql` แล้ว
ไฟล์รูปยังอยู่ใน R2 ไม่ได้ย้ายไป Supabase Storage ดูขั้นตอนใน `../docs/SUPABASE.md`

## 1. สร้างตาราง

เปิด Supabase → SQL Editor แล้วรัน `create-tables.sql` **ครั้งเดียว** บนฐานข้อมูลที่ยังไม่มีตารางชื่อเดียวกัน
ไฟล์นี้ใช้ transaction: ถ้าเกิดข้อผิดพลาดจะไม่สร้างตารางค้างบางส่วน ไม่ได้ drop ตารางเดิม

สำหรับฐานข้อมูลเดิมที่มี `owner_id` อยู่แล้ว ให้รัน `rename-owner-columns.sql`
แทนการสร้างตารางซ้ำ สคริปต์จะเปลี่ยนชื่อ FK และติดตั้ง RPC รุ่นใหม่ใน transaction เดียว
โดยไม่ลบหรือนำเข้าข้อมูลใหม่ จากนั้น restart Node API เพื่อใช้ชื่อ column ใหม่

| Column | ตาราง master ที่อ้างถึง |
| --- | --- |
| `users_id` | `auth.users.id` (อยู่ใน profiles) |
| `profiles_id` | `profiles.id` |
| `journeys_id` | `journeys.id` |
| `trips_id` | `trips.id` |
| `trip_places_id` | `trip_places.id` |
| `expenses_id` | `expenses.id` |
| `attachments_id` | `attachments.id` |

มี 9 ตาราง: profiles, journeys, trips, trip_places, expenses, attachments,
trip_attachments, place_attachments, expense_attachments

- `created_at` และ `modified_at` ใช้ `timestamptz` เก็บ instant และรองรับ UTC
- `created_by` และ `modified_by` เป็น varchar ตามที่กำหนด โดยบันทึก Auth user ID
- `tags` ใช้ PostgreSQL `text[]`
- `profiles.users_id` เป็น UUID อ้างถึง `auth.users.id`
- `profiles.id` เป็น UUID primary key และตารางลูกใช้ `profiles_id` อ้างถึง ID นี้โดยตรง
- ตารางลูกใช้ primary key `(profiles_id, id)` เพื่อให้คนละบัญชีนำเข้า demo ID เดียวกันได้
- หนึ่งบัญชีมีหนึ่ง profile โดยรักษา UUID เดิมให้ `profiles.id = profiles.users_id`
- Foreign key แบบ composite ป้องกันการอ้างข้ามเจ้าของ แม้จะนำเข้าด้วย admin
- เปิด RLS ทุกตาราง ผู้ใช้ที่ login อ่าน/เพิ่ม/แก้ไขได้เฉพาะข้อมูลตัวเอง
- ไม่เปิด anonymous access หรือ hard delete ให้ frontend; ใช้ `valid = false` แทน
- SELECT เห็น soft-deleted rows ของตัวเองได้เพื่อ restore; หน้าจอปกติต้อง filter `valid = true`
- Trigger รักษา created_at/by เดิมเมื่อ update และตั้ง modified_at/by อัตโนมัติ
- INSERT จาก SQL Editor ที่ไม่มี auth.uid() สามารถรักษาเวลาจาก export เดิมได้

ดูหลักการ grants + RLS จาก [Supabase documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 2. เลือกเจ้าของข้อมูล

สร้างบัญชีผ่านระบบ Auth ของ Supabase ก่อน แล้วคัดลอก User UID จาก Authentication → Users
ใช้ UUID นี้กับ `--owner` สคริปต์จะไม่สร้างบัญชีหรือรหัสผ่านให้

## 3. นำเข้า JSON ที่แนบในแชต

ไฟล์ `import-pasted-json.sql` เตรียมจาก JSON ที่แนบแล้ว:

- profiles 1, journeys 1, trips 2, trip_places 45, expenses 4
- attachments, trip_attachments, place_attachments, expense_attachments เป็น 0 ทั้งหมด
- ข้าม mediaIds ของ trip/place/expense ไม่นำรูปเก่าหรือ reference รูปเก่าเข้าฐานข้อมูล

ไฟล์นำเข้าตั้ง Auth User UID เป็น `4e32b8ed-32a3-414e-8b8d-90545caa2ae8` ตามที่ระบุแล้ว
รันใน SQL Editor ของ project ที่มีผู้ใช้นี้ หลังสร้างตารางเสร็จ สคริปต์จะตรวจว่า user มีจริงก่อน INSERT
ไฟล์นี้มีข้อมูลส่วนตัวจาก export; ควรตรวจเนื้อหาก่อนนำไป commit หรือแชร์

## 4. สร้าง INSERT SQL จาก JSON อื่น

เปิด terminal ในโฟลเดอร์ `Roava` ใช้ Node.js ที่โปรเจกต์มีอยู่แล้ว ไม่ต้องติดตั้ง dependency:

```powershell
node scripts/json-to-postgres.mjs --input "C:\backups\travel.json" --owner "YOUR_AUTH_USER_UUID" --timezone Asia/Shanghai --output "database/import.sql"
```

ไฟล์ input เป็น UTF-8 JSON ตาม TravelDocument schemaVersion 1; รองรับ UTF-8 BOM
สคริปต์อ่านไฟล์แล้วสร้าง SQL เท่านั้น ไม่เชื่อมต่อ Supabase และไม่ต้องใช้ API key
ให้นำไฟล์ output ไปรันใน SQL Editor

`--timezone` ใช้กับทริปที่ JSON ไม่มี timezone; ตัวอย่างจีนใช้ Asia/Shanghai
หากเป็นหลายประเทศให้เพิ่ม `timezone` รายทริปก่อนนำเข้า อย่าใช้ค่าเดียวหากเวลาท้องถิ่นต่างกัน
`visitedAt`/`spentAt` ยังคงเป็น date และเวลา itinerary เป็น local time ของทริป
โปรไฟล์ default เป็น Asia/Bangkok เปลี่ยนได้ด้วย `--profile-timezone`
สกุลหลัก default THB เปลี่ยนได้ด้วย `--currency`

### การรันซ้ำ

- ปกติใช้ `ON CONFLICT (profiles_id, id) DO NOTHING` และ `(id)` สำหรับ profiles: เพิ่มเฉพาะรายการที่ไม่มี ไม่ทับข้อมูลเดิม
- เพิ่ม `--upsert` ถ้าตั้งใจอัปเดตแถวเดิมตามไฟล์; จะเปิด `valid = true` และแก้ modified timestamp
- ทั้งสองโหมดไม่ลบแถวหรือความสัมพันธ์ที่หายไปจาก JSON จึงเป็น additive import ไม่ใช่ replace/sync
- ถ้าต้องการนำเข้า metadata เพิ่มภายหลัง ให้ใช้ `--media ... --upsert`
- JSON ไม่มี audit ของ place/expense จึงใช้เวลาสร้าง trip; attachment ใช้เวลานำเข้า
- journeyGroupId ไม่มีชื่อกลุ่มแยก จึงใช้ ID เป็นชื่อเริ่มต้นให้แก้ภายหลัง
- ไม่มีการสร้าง exchange rate สมมติ; conversion fields คงเป็น NULL

## 5. ข้อมูลรูปภาพ

ค่าเริ่มต้นของสคริปต์ข้าม mediaIds ทั้งหมด ไม่สร้าง attachments หรือตารางเชื่อมรูป
รูปใหม่ที่แนบผ่านแอปยังอัปโหลดเข้า R2 และบันทึกข้อมูลได้ตามปกติ
หากต้องการนำเข้า reference ของรูปโดยตั้งใจในภายหลัง ให้เพิ่ม `--include-media`
กรณีเปิดตัวเลือกนี้แต่ไม่มี metadata จะได้ `status = 'missing_metadata'` และ bucket/path เป็น NULL
อย่าเดา key จากวันเดินทางหรือ capturedAt เพราะ R2 ใช้เดือนอัปโหลดจริง

ถ้ามี metadata จริงจาก R2 `roava/media/records/<id>.json` ให้รวมเป็น JSON array
หรือ object ที่มี media ID เป็น key แล้วส่งผ่าน `--media`:

```json
[
  {
    "id": "d2c9f267-763e-4cec-8b6b-17aa7bba20da",
    "bucket": "YOUR_REAL_R2_BUCKET",
    "key": "COPY_THE_ACTUAL_KEY_FROM_R2_METADATA",
    "fileName": "receipt.jpg",
    "contentType": "image/jpeg",
    "size": 123456,
    "capturedAt": "2026-10-16T00:00:00Z",
    "url": "/api/media/d2c9f267-763e-4cec-8b6b-17aa7bba20da"
  }
]
```

```powershell
node scripts/json-to-postgres.mjs --input "C:\backups\travel.json" --owner "YOUR_AUTH_USER_UUID" --timezone Asia/Shanghai --include-media --media "C:\backups\media.json" --bucket "YOUR_REAL_R2_BUCKET" --upsert --output "database/import.sql"
```

- `--bucket` เป็นค่าเริ่มต้น ถ้า metadata แต่ละรูปมี bucket จะใช้ค่านั้น
- `key` หรือ `path` ต้องเป็น key จริงภายใน bucket; ไม่ใช้ storedFileName แทน key
- สถานะ ready หมายถึงมี bucket/path ครบจาก manifest ไม่ใช่ตรวจสอบว่า object มีอยู่จริง
- นำเข้าเฉพาะ metadata ของ mediaIds ที่ JSON อ้างถึง ไม่มีการอัปโหลดหรือ copy ไฟล์
- `type` เป็น upload origin; เมื่อ export ไม่ระบุ จะอนุมาน expense → place → trip ตามการใช้งาน
- รูปเดียวมีหลาย link ได้ การลบ link ต้องไม่ลบไฟล์ที่ยังมีคนใช้
- `url` ไม่จำเป็น ถ้าไม่ได้ระบุจะเป็น NULL; backend คำนวณ URL เมื่อเรียกอ่านได้
- ไม่ควรบันทึก signed URL ที่หมดอายุเป็นตำแหน่งถาวร
- ค่า R2 bucket/key เป็น metadata เท่านั้น ไม่ใช่ access credentials

## 6. ตรวจผลหลังนำเข้า

รันใน SQL Editor โดยแทน UUID เช่นเดียวกัน:

```sql
select 'trips' as table_name, count(*) from public.trips where profiles_id = 'YOUR_AUTH_USER_UUID'::uuid
union all
select 'trip_places', count(*) from public.trip_places where profiles_id = 'YOUR_AUTH_USER_UUID'::uuid
union all
select 'expenses', count(*) from public.expenses where profiles_id = 'YOUR_AUTH_USER_UUID'::uuid;

select id, type, status, bucket, path
from public.attachments where profiles_id = 'YOUR_AUTH_USER_UUID'::uuid;

-- ห้ามรวมเงินข้ามสกุลโดยยังไม่ได้แปลง
select currency, sum(amount) from public.expenses
where profiles_id = 'YOUR_AUTH_USER_UUID'::uuid and valid group by currency;
```

RLS นี้คุ้มครองแถวใน PostgreSQL เท่านั้น ระบบ R2 API เดิมต้องผูก authentication/ownership
กับ backend แยกด้วย ก่อนเปิดให้หลายบัญชีใช้งานจริง

## Development verification

```powershell
node --test scripts/test-postgres-import.mjs
```

Optional SQL execution test (isolated local PostgreSQL WASM, no Supabase project access):

```powershell
npm.cmd install --prefix tmp/roava-postgres-test --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.3.14
node --test scripts/test-postgres-database.mjs
```
