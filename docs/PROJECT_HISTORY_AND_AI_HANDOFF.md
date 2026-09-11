# Personal Geospatial Travel Memory Platform Project History and AI Handoff

## Seven Continent Proof of Concept with Local Media Server

เอกสารนี้เป็นแหล่งอ้างอิงกลางของโปรเจกต์สำหรับเจ้าของโปรเจกต์ นักพัฒนา และ AI ที่เข้ามาทำงานต่อ เช่น Codex Claude และ Gemini เป้าหมายคือให้ผู้รับช่วงเข้าใจว่าโปรเจกต์เกิดจากอะไร เหตุใดแต่ละฟีเจอร์จึงถูกเพิ่ม ระบบปัจจุบันทำงานอย่างไร และข้อกำหนดใดห้ามเปลี่ยนโดยไม่รับความเห็นชอบจากเจ้าของโปรเจกต์

เอกสารฉบับนี้สรุปสถานะจาก requirement เริ่มต้น บทสนทนาและการปรับแก้ต่อเนื่อง จนถึงโค้ดที่ตรวจสอบเมื่อวันที่ 10 กันยายน 2026 หากเอกสารนี้ขัดกับโค้ด ให้ตรวจสอบโค้ดและยืนยันกับเจ้าของโปรเจกต์ก่อนแก้เอกสารหรือเปลี่ยนพฤติกรรมของระบบ

## ข้อมูลเอกสาร

| รายการ | ค่า |
| --- | --- |
| ชื่อโปรเจกต์ | Personal Geospatial Travel Memory Platform |
| ชื่อ POC | Personal Travel Memory และ AI Travel Atlas |
| สถานะ | Proof of Concept สำหรับผู้ใช้หนึ่งคน พร้อม Angular frontend และ local filesystem media server |
| เทคโนโลยีหลัก | Angular 22 Node.js media server MapLibre GL JS Static GeoJSON localStorage IndexedDB fallback Tesseract.js |
| ขอบเขตภูมิศาสตร์ปัจจุบัน | 7 ทวีป รวม 196 geographic entries: Asia 48, Africa 54, North America 23, South America 12, Europe 44, Australia/Oceania 14, Antarctica 1 |
| แหล่งข้อมูลจริงของสถานะ visited | Trip data เท่านั้น |
| วันที่ตรวจสอบล่าสุด | 11 กันยายน 2026 |

## สรุปสำหรับผู้รับช่วง

ระบบนี้คือแผนที่ความทรงจำการเดินทางส่วนบุคคล ไม่ใช่ trip planner และไม่ใช่แอปกรอกฟอร์มทั่วไป ผู้ใช้ควรเปิด World Atlas แล้วเลือกทวีป เห็นประวัติชีวิตการเดินทางของตนเอง จากนั้นไล่ดูตามลำดับ ทวีป ประเทศ เมือง ทริป สถานที่ รูป ค่าใช้จ่าย บันทึก และบทสรุป

POC ใช้ข้อมูลใน browser เพื่อพิสูจน์ประสบการณ์ใช้งานก่อนลงทุนกับ backend ประเทศที่เคยไปและเมืองที่เคยไปต้องคำนวณจาก Trip data ห้ามมี boolean visited แยกต่างหาก การเลือกรูปหลายรูปแล้วให้ OCR และตัววิเคราะห์ช่วยสร้าง draft ของทริปคือก้าวแรกไปสู่เป้าหมายระยะยาวที่ผู้ใช้เพียงอัปโหลดรูป ระบบทำความเข้าใจทริป และผู้ใช้ตรวจสอบก่อนยืนยัน

สิ่งที่ต้องรักษาเมื่อพัฒนาต่อมีดังนี้

- หน้าแรกต้องเป็นแผนที่และสถิติของทวีป ไม่ใช่รายการทริป
- ชื่อประเทศต้องแสดงทั้งประเทศที่เคยไปและยังไม่เคยไป
- ประเทศที่ visited แสดงด้วยลายธงชาติที่เต็มขอบเขตประเทศ ส่วนประเทศที่ยังไม่เคยไปใช้สี neutral
- ประเทศที่ถูกเลือกต้องแสดงสถานะ focus ด้วยธงและเส้นขอบสีทอง แม้ประเทศนั้นยังไม่มีทริป แต่ห้ามนับเป็น visited
- เมื่อเลือกประเทศจากแผนที่หรือ dropdown แผนที่ต้องซูมจาก geometry จริงและจัดประเทศไว้กึ่งกลางพื้นที่ที่ยังมองเห็น โดยเว้นพื้นที่ให้ detail card
- polygon และ label ต้องใช้กล้องเดียวกันและเคลื่อนพร้อมกันทุกครั้งที่ pan zoom หรือ resize
- dropdown ต้องแสดงเฉพาะประเทศในทวีปที่กำลังเปิดอยู่ ปัจจุบันรองรับครบทั้ง 7 ทวีป
- การนำเข้ารูปรองรับหลายรูป สูงสุด 30 รูป OCR ภาษาไทยและอังกฤษในเครื่อง และต้องมี review ก่อนบันทึก
- UI ต้องเรียกผ่าน TravelRepository MediaStorage SummaryProvider OcrProvider และ PhotoAnalysisProvider ไม่ผูก component กับ storage หรือ engine โดยตรง
- ห้ามเพิ่ม backend database authentication cloud storage queue หรือ infrastructure อื่นใน POC หากไม่ได้รับคำสั่งโดยตรง

## ความเป็นมาของผลิตภัณฑ์

จุดเริ่มต้นมาจากปัญหาที่ข้อมูลการเดินทางของคนหนึ่งคนกระจายอยู่ในหลายที่ รูปอยู่ในคลังภาพ ค่าใช้จ่ายอยู่ในใบเสร็จหรือแอปธนาคาร สถานที่อยู่ในแผนที่ และความทรงจำอยู่ในโน้ตหรือไม่มีการบันทึก ข้อมูลเหล่านี้จึงตอบคำถามง่าย ๆ ได้ยาก เช่น เคยไปเมืองใดบ้าง ใช้เงินกับประเทศหนึ่งเท่าไร หรือทริปใดมีรูปและสถานที่มากที่สุด

แนวคิดของผลิตภัณฑ์จึงเป็น Personal Geospatial Travel Memory Platform หรือแผนที่ชีวิตการเดินทางของตัวเอง แผนที่ทำหน้าที่เป็นจุดเริ่มต้นของความทรงจำ ไม่ใช่เพียงฉากประกอบ ผู้ใช้ควรเห็นร่องรอยการเดินทางของตัวเองทันที และเจาะจากภาพรวมระดับทวีปไปถึงรายละเอียดของแต่ละทริปได้

ขอบเขตเริ่มต้นเลือก Asia ทั้งทวีปตั้งแต่วันแรกเพื่อให้ POC สื่อภาพของแพลตฟอร์มจริง ไม่ดูเป็นตัวอย่างที่รองรับเพียงสองหรือสามประเทศ อย่างไรก็ตาม การรองรับ 48 ประเทศหมายถึงมีขอบเขตประเทศและโครงสร้างข้อมูลพร้อม ไม่ได้หมายความว่าต้องมี POI ของทุกเมืองตั้งแต่เริ่มต้น สถานที่เกิดจากข้อมูลที่ผู้ใช้บันทึกจริง

## เป้าหมายประสบการณ์ใช้งาน

เส้นทางหลักของผู้ใช้คือ

```text
World Atlas
  Continent
  Country
    City
      Trip
        Places
        Photos
        Expenses
        Notes
        Summary
```

ประสบการณ์ที่ POC ต้องพิสูจน์คือ ผู้ใช้เปิด World Atlas สลับทวีป เห็นประเทศที่มีความทรงจำ เลือกประเทศแล้วเห็นเมืองที่เกี่ยวข้อง เปิดเมืองเพื่อดูทริปและรายละเอียด จากนั้นเพิ่มหรือแก้ไขข้อมูลได้โดยไม่สูญหายเมื่อ reload browser

หลักการสำคัญคือระบบต้องลดงานกรอกข้อมูล ไม่เพิ่มงานกรอกข้อมูล แม้ POC ยังรองรับ manual entry แต่ทิศทางของผลิตภัณฑ์คือ Photo first ผู้ใช้อัปโหลดหลักฐานการเดินทาง ระบบเสนอข้อมูลที่น่าจะเป็น และผู้ใช้เป็นผู้ตรวจสอบก่อนบันทึก

## ขอบเขตของ POC

### สิ่งที่อยู่ในขอบเขต

- Dashboard ทั้ง 7 ทวีปพร้อมสถิติและ progress ที่กรองตามทวีป
- แผนที่ 196 geographic entries จาก Static GeoJSON แยก asset ตามทวีป
- สถานะ visited ของประเทศและเมืองที่ derive จาก Trip data
- Country view และ city marker
- City Memory page
- Trip Place Expense Notes และ Photo CRUD
- รูปและ thumbnail ใน IndexedDB
- ข้อมูลทริปแบบ structured ใน localStorage
- Local summary
- Import และ Export JSON
- Multi image import พร้อม OCR และการวิเคราะห์ draft
- SVG fallback และ vector overlay สำหรับสภาพแวดล้อมที่ MapLibre canvas แสดงผลไม่สมบูรณ์

### สิ่งที่อยู่นอกขอบเขต

- Backend API และฐานข้อมูล
- Authentication และหลายผู้ใช้
- Supabase PostgreSQL PostGIS Redis และ queue
- Cloud media storage เช่น R2 หรือ S3
- AI API จริงและ secret key ฝั่ง client
- GeoServer vector tile server CesiumJS และ 3D fly through
- การอ่าน EXIF GPS และการจัดกลุ่มรูปเป็นทริปอัตโนมัติเต็มรูปแบบ
- การสำรอง binary ของรูปไปกับไฟล์ export

เหตุผลของข้อจำกัดนี้คือ POC ต้องตอบก่อนว่าแผนที่และ flow การเก็บความทรงจำมีคุณค่าต่อผู้ใช้หรือไม่ การเพิ่ม infrastructure ในขั้นนี้เพิ่มเวลาและค่าใช้จ่าย แต่ยังไม่ช่วยตอบคำถามด้าน UX

## สถานะระบบปัจจุบัน

Frontend เป็น Angular standalone application มี route หลักสามส่วน ได้แก่ Dashboard รายการทริป และ City Memory ข้อมูล structured เก็บที่ localStorage ภายใต้ key `travel-atlas:poc` รูปต้นฉบับและ thumbnail เก็บใน IndexedDB ชื่อ `travel-atlas-media`

แผนที่ใช้ MapLibre สำหรับ camera projection event และ marker ส่วน country polygon ที่ผู้ใช้เห็นเป็น SVG vector overlay ที่ project จาก GeoJSON ด้วยกล้องของ MapLibre วิธีนี้เกิดจากการแก้ปัญหาใน browser บางสภาพแวดล้อมที่ WebGL canvas ไม่แสดง polygon ตามที่คาด แต่ marker และการ zoom ยังทำงานอยู่

ระบบรองรับ route `continent/:continentCode` สำหรับ AF AN AS EU NA OC และ SA แต่ละ route โหลด catalog, GeoJSON, SVG fallback, initial camera, dropdown, trip list และสถิติของทวีปนั้น มีทั้งหมด 196 geographic entries แบ่งเป็น Asia 48, Africa 54, North America 23, South America 12, Europe 44, Australia/Oceania 14 และ Antarctica 1 ประเทศข้ามทวีปถูกจัดแบบ Asia-first: Türkiye, Cyprus, Georgia, Armenia, Azerbaijan และ Kazakhstan อยู่ Asia ส่วน Russia อยู่ Europe

Production build ล่าสุดสำเร็จเมื่อวันที่ 10 กันยายน 2026 และสร้าง output ที่ `dist/asia-travel-atlas` การ build ภายใน sandbox อาจล้มเหลวด้วย access denied จาก Angular compiler แต่การ build ในสิทธิ์ปกติของ workspace สำเร็จ

## ประวัติและเหตุผลของแต่ละฟีเจอร์

### แผนที่เป็นหน้าแรก

Requirement เริ่มต้นกำหนดให้หน้าแรกเป็น My Asia Dashboard เพราะคุณค่าหลักของผลิตภัณฑ์คือการเห็นภาพรวมการเดินทาง หากเริ่มจาก trip list ระบบจะดูเหมือน travel journal หรือ CRUD application ทั่วไปและไม่แสดงความแตกต่างของแนวคิด geospatial memory

Dashboard จึงแสดงจำนวนประเทศ เมือง ทริป สถานที่ วันเดินทาง ค่าใช้จ่าย และ progress โดย map เป็นองค์ประกอบหลัก ปัจจุบันตัวเลขและรายการ recent memories คำนวณจาก trip ที่อยู่ใน active continent เท่านั้น

### สถานะ visited จาก Trip data

ระบบไม่บันทึก `chinaVisited = true` หรือ flag แบบเดียวกัน เพราะ flag แยกอาจไม่ตรงกับข้อมูลทริป เช่น ลบทริปสุดท้ายของจีนแล้วประเทศยังคง visited สถานะจึง derive จาก `trip.countryCode` และเมือง derive จากคู่ `countryCode:cityCode`

ผลของกฎนี้คือการเพิ่ม ลบ import หรือ reset ทริปต้องทำให้แผนที่และสถิติเปลี่ยนตามโดยอัตโนมัติ ผู้พัฒนาหรือ AI ห้ามแก้ด้วยการเพิ่ม visited state แยกเพื่อแก้ปัญหา UI ชั่วคราว

### Multi image OCR และตัววิเคราะห์รูป

ผู้ใช้ขอให้ import รูปหลายรูป OCR ตัวอักษรจากรูป และให้ AI วิเคราะห์ว่าควรกรอกข้อมูลใด ความต้องการนี้ต่อยอดจาก product principle ที่ไม่ต้องการให้ผู้ใช้กรอกทุก field เอง

ระบบปัจจุบันเลือกรูปภาพได้สูงสุด 30 รูป สร้าง preview รัน Tesseract.js แบบ local ด้วยภาษาอังกฤษและไทย แสดง progress รายไฟล์ แล้วส่งข้อความที่อ่านได้ให้ `LocalPhotoAnalysisProvider` วิเคราะห์ประเทศ เมือง วันที่ สถานที่ ค่าใช้จ่าย tag และ notes ผลลัพธ์เป็น draft ที่แก้ไขหรือยกเลิกรายการได้ก่อนบันทึก

คำว่า AI ใน POC หมายถึง provider สำหรับการวิเคราะห์ที่ปัจจุบันใช้ rule และ heuristic ในเครื่อง ยังไม่ได้เรียก large language model หรือ service ภายนอก ขอบเขตนี้รักษาความเป็นส่วนตัว ลดค่าใช้จ่าย และไม่ต้องฝัง API key ใน Angular ภายหลังสามารถเพิ่ม remote implementation หลัง backend พร้อม โดยไม่เปลี่ยน UI flow

ในการทดสอบรอบพัฒนา รูปตัวอย่างสองรูปให้ OCR เฉลี่ยประมาณ 95 เปอร์เซ็นต์ และตรวจพบ China Beijing ช่วงวันที่ Hotel 18600 THB และ Ticket 1200 THB ผลนี้เป็นหลักฐานจากรอบทดสอบตัวอย่าง ไม่ใช่ SLA และไม่รับประกันกับรูปจริงทุกสภาพ

### การแก้ปัญหา China ไม่ highlight

หลังเพิ่มข้อมูลประเทศจีน ผู้ใช้พบว่า detail เปลี่ยนแต่พื้นที่ China ไม่ highlight สาเหตุไม่ได้อยู่ที่ trip data อย่างเดียว แต่เกิดจาก MapLibre WebGL canvas ใน in app browser บางครั้งไม่ render ชั้น polygon ขณะที่ SVG fallback ยังเป็นภาพ static และไม่อ่านสถานะ trip

การแก้ไขทำให้ fallback อ่านจำนวนทริปและปรับ fill stroke opacity ได้แบบ dynamic จากนั้นพัฒนาไปเป็น SVG vector overlay ที่ใช้ GeoJSON เดียวกับ MapLibre เพื่อให้ภาพที่เห็นสัมพันธ์กับข้อมูลและ camera จริง

### ชื่อประเทศต้องแสดงตลอดเวลา

ผู้ใช้กำหนดชัดว่าชื่อทุกประเทศต้องแสดงทั้งก่อนและหลังเดินทาง เพราะชื่อคือข้อมูลนำทางพื้นฐาน หากซ่อนชื่อประเทศที่ยังไม่ visited ผู้ใช้จะไม่รู้ว่าพื้นที่ใดเลือกได้ และ map จะสื่อสารไม่ครบ

ระบบจึงสร้าง country label จาก catalog และ geometry โดยเลือกตำแหน่งจาก polygon หลัก ชื่อยังคงแสดงในทุก state และเปลี่ยนน้ำหนักหรือ style ได้เฉพาะเพื่อเพิ่ม readability ห้ามผูก visibility ของ label กับ visited state

### การแก้ปัญหา label ขยับแต่ polygon ไม่ขยับ

รุ่นก่อนใช้ MapLibre marker สำหรับ label แต่แสดงประเทศจาก SVG static เมื่อ zoom หรือ pan marker จึงเคลื่อนตามกล้อง แต่ polygon ไม่เคลื่อน ทำให้ layout เพี้ยน

การแก้ไขปัจจุบัน project พิกัดทุก ring ของ Polygon และ MultiPolygon ผ่าน `map.project` แล้วเขียน path ลง SVG overlay ใหม่เมื่อ map move หรือ resize การ sync ถูกจัดผ่าน `requestAnimationFrame` เพื่อลดงานซ้ำในหนึ่ง frame Polygon label และ city marker จึงอ้างอิง camera เดียวกัน

นี่เป็น invariant สำคัญ หากเปลี่ยน rendering architecture ต้องทดสอบว่าทุก layer เคลื่อนพร้อมกัน ไม่ควรแก้ด้วย CSS transform แยกคนละชุด

### เปลี่ยน highlight จากสีเขียวเป็นธงชาติ

ผู้ใช้เห็นว่าการใช้สีเขียวเพียงสีเดียวไม่สื่อเอกลักษณ์ของประเทศและเสนอให้ใช้ธงชาติ พื้นที่ visited และ selected จึงใช้ SVG flag จากแพ็กเกจ `flag-icons` ที่ copy มาเป็น local asset ระหว่างพัฒนา

สถานะ visited ยังมาจาก Trip data ส่วน selected เป็น interaction state แยกกัน ประเทศ selected จะแสดงธงและเส้นขอบสีทองเพื่อให้ผู้ใช้เห็นผลการเลือก แม้ยังไม่มีทริป แต่ตัวเลข visited และ progress ต้องไม่เพิ่ม

### การแก้ปัญหาธงไม่เต็มกรอบประเทศ

การใช้ `preserveAspectRatio` แบบ crop ทำให้บางส่วนของธงถูกตัดและดูเหมือน SVG ไม่เต็มประเทศ วิธีปัจจุบันใช้ `preserveAspectRatio="none"` และสำหรับ vector overlay กำหนด pattern เป็น `userSpaceOnUse` โดยคำนวณ bounding box ของประเทศใหม่ทุกครั้งที่ camera เปลี่ยน รูปธงจึงยืดให้เต็มขอบเขตของประเทศโดยไม่มีช่องว่าง

ผลที่ยอมรับได้คือสัดส่วนธงอาจถูกยืดตามรูปร่างหรือ bounding box ของประเทศ เพราะเป้าหมายคือให้เห็นองค์ประกอบธงเต็มพื้นที่ ไม่ใช่รักษาอัตราส่วน 4 ต่อ 3 แล้วครอบตัด หากเปลี่ยนวิธี fill ต้องตรวจประเทศที่ยาว หมู่เกาะ และ MultiPolygon ด้วย

### Dropdown จำกัดตามทวีป

ผู้ใช้ชี้ว่า Jump to Country ต้องแสดงเฉพาะประเทศในทวีปปัจจุบัน เพราะระบบจะมี 7 ทวีป ระบบจึงใช้ `ContinentCode` และฟังก์ชัน `countriesByContinent` Dashboard ส่งเฉพาะ catalog ของ active continent ให้ map, dropdown, form และ Smart Photo Import

การขยายครบ 7 ทวีปทำด้วย dashboard เดียวและ map component เดียว ไม่ duplicate component รายทวีป แต่ใช้ metadata `mapKey`, `center` และ `zoom` เพื่อโหลด asset และตั้ง camera แบบ dynamic ห้ามรวมประเทศทั้งหมดไว้ใน dropdown เดียว

### การเลือกประเทศต้อง zoom และจัดกึ่งกลาง

เมื่อผู้ใช้เลือกประเทศจาก dropdown ระบบเดิมเปลี่ยน detail card และ highlight แต่ไม่ได้รับประกันว่าประเทศจะอยู่ตรงกลาง การแก้ไขใช้ geometry จริงสร้าง `LngLatBounds` และเรียก `fitBounds` พร้อม padding ด้านซ้ายสำหรับ country detail card บน desktop และ padding ด้านล่างสำหรับ layout mobile

ระดับ zoom สูงสุดปรับตามขนาด geometry เพื่อให้ประเทศเล็กยังมองเห็นชัด ปัจจุบันใช้ค่าประมาณดังนี้

| ขนาด span สูงสุดของ bounds | max zoom |
| --- | ---: |
| น้อยกว่า 0.75 องศา | 8.4 |
| น้อยกว่า 2 องศา | 7.2 |
| น้อยกว่า 5 องศา | 6.4 |
| ตั้งแต่ 5 องศาขึ้นไป | 5.6 |

ก่อน focus ระบบเรียก `map.stop()` เพื่อหยุด animation เดิม ลดกรณีคำสั่งกล้องแข่งขันกัน

### การแก้ปัญหา Armenia ไม่ highlight และไม่ focus

กรณี Armenia แสดง detail card ถูกต้อง แต่แผนที่ยังค้างอยู่ที่ China ปัญหานี้สำคัญเพราะยืนยันว่าการเปลี่ยน selected state สำเร็จ แต่ camera path ไม่ทำงานกับบางจังหวะของ map

สาเหตุคือ `refresh()` เคยหยุดทำงานเมื่อ `map.isStyleLoaded()` เป็น false ทำให้การ focus ถูกข้าม ทั้งที่ geometry และ map instance พร้อมแล้ว การแก้ไขนำ guard นี้ออกจาก flow ที่ควบคุม camera ทำให้ focus ไม่ขึ้นกับสถานะการ render ของ WebGL style พร้อมเพิ่ม flag และเส้นขอบของ selected country ที่ไม่มีทริป

หลังแก้ได้ตรวจ Armenia ซึ่งเป็น MultiPolygon และ Singapore ซึ่งเป็นประเทศขนาดเล็ก เพื่อยืนยัน adaptive zoom และการจัดตำแหน่งเทียบกับ detail card

## สถาปัตยกรรมปัจจุบัน

```text
User
  Angular Feature Components
    TravelStore
      TravelRepository
        LocalTravelRepository
          localStorage
    MediaStorage
      IndexedDbMediaStorage
        IndexedDB
    SummaryProvider
      LocalSummaryProvider
    OcrProvider
      TesseractOcrProvider
    PhotoAnalysisProvider
      LocalPhotoAnalysisProvider
    AtlasMap
      Static GeoJSON
      MapLibre camera and interaction
      SVG fallback and vector overlay
      Local flag assets
```

Angular dependency injection ใน `app.config.ts` ผูก abstraction กับ local implementation การย้ายไป production ควรเพิ่ม implementation ใหม่ เช่น `ApiTravelRepository` หรือ `RemoteMediaStorage` แล้วเปลี่ยน provider binding ไม่ควรแก้ทุก component ให้เรียก HTTP โดยตรง

## Data flow สำคัญ

### การสร้างทริปแบบ manual

```text
TripEditor
  TravelStore.save
    TravelRepository.saveTrip
      localStorage
  TravelStore.reload
    derive visited countries cities and statistics
      Dashboard and AtlasMap refresh
```

### การสร้างทริปจากรูป

```text
Multiple image files
  Tesseract OCR Thai and English
    OCR results and confidence
      Local photo analysis
        Reviewable trip draft
          User confirms and edits
            Save original images and thumbnails to IndexedDB
            Save media identifiers in Trip
            Save Trip to localStorage
              Refresh map and statistics
```

### การเลือกประเทศ

```text
Map click or continent scoped dropdown
  selectedCountry signal
    country detail card
    selected flag and gold outline
    calculate bounds from GeoJSON geometry
      fitBounds with responsive padding
        show city markers
```

## แบบจำลองข้อมูลและการจัดเก็บ

Root document ใช้ schema version 1 และมี profile กับ trips การเก็บ schema version ตั้งแต่ POC ทำให้สามารถเพิ่ม field และทำ migration ภายหลังได้

Trip ประกอบด้วย countryCode cityCode date range description notes tags places expenses mediaIds และข้อมูลเวลา create update สถานะ visited ไม่อยู่ใน model เพราะคำนวณได้

รูป binary ไม่เก็บใน localStorage เพราะมีขนาดจำกัดและรองรับเฉพาะ string `IndexedDbMediaStorage` เก็บ original blob thumbnail blob ชื่อไฟล์ content type tripId และ capturedAt ส่วน Trip เก็บเฉพาะ media ID

JSON export ปัจจุบันสำรอง structured data และ media reference แต่ไม่รวม blob รูป หาก clear browser data รูปจะหายแม้มี JSON backup Roadmap ควรเพิ่ม ZIP export ที่มี `data.json` และโฟลเดอร์ media ก่อนถือว่า backup ครบถ้วน

## แผนผังโค้ดที่ควรอ่าน

| ลำดับ | ไฟล์ | หน้าที่ |
| ---: | --- | --- |
| 1 | `docs/PROJECT_HISTORY_AND_AI_HANDOFF.md` | บริบท การตัดสินใจ invariant และสถานะล่าสุด |
| 2 | `src/app/core/data/asia-catalog.ts` | ทวีป ประเทศ เมือง และ helper สำหรับ scope |
| 3 | `src/app/core/models/travel.models.ts` | Contract ของ Trip Place Expense Media และ TravelDocument |
| 4 | `src/app/core/state/travel-store.ts` | State การ derive visited และสถิติ |
| 5 | `src/app/shared/atlas-map/atlas-map.ts` | MapLibre SVG overlay label flag focus และ event |
| 6 | `src/app/features/dashboard/asia-dashboard/asia-dashboard.ts` | Dashboard state continent scope และ action |
| 7 | `src/app/features/media/photo-importer/photo-importer.ts` | Multi image import review และ save flow |
| 8 | `src/app/core/ocr/tesseract-ocr.provider.ts` | Local OCR engine และ asset path |
| 9 | `src/app/core/analysis/local-photo-analysis.provider.ts` | Heuristic extraction จาก OCR text |
| 10 | `src/app/core/storage` | Repository และ IndexedDB implementations |
| 11 | `angular.json` | การ copy OCR worker core และ language data ตอน build |
| 12 | `public/assets/maps/{continent}` | GeoJSON และ SVG fallback แยก 7 ทวีป |
| 13 | `scripts/generate-world-maps.mjs` | สร้าง map assets และ catalog นอกเอเชียจาก world-atlas/world-countries |
| 14 | `src/app/core/data/world-countries.generated.ts` | Catalog ที่ generate สำหรับ 6 ทวีปนอกเอเชีย |

## กฎของแผนที่

กฎเหล่านี้เป็น acceptance invariant ของ UI

- Country catalog และ GeoJSON ต้องใช้ ISO alpha 2 code ตรงกัน
- ประเทศใน map และ dropdown ต้องถูกกรองด้วย continent code เดียวกัน
- Country label ต้องแสดงเสมอและต้องไม่ซ้ำระหว่าง fallback กับ MapLibre marker
- Visited state มาจาก trip เท่านั้น
- Selected state เป็น feedback ชั่วคราวและไม่เปลี่ยน progress
- Selected country ต้องเห็นชัดกว่าประเทศอื่นด้วย flag outline และ opacity ของบริเวณรอบข้าง
- Flag pattern ต้องคำนวณใหม่เมื่อ camera เปลี่ยน
- Polygon label และ city marker ต้องเคลื่อนตาม camera เดียวกัน
- Focus ต้องใช้ geometry bounds ไม่ใช้พิกัดเมืองหลวงแทนประเทศ
- Desktop padding ต้องเผื่อ country card ด้านซ้าย Mobile padding ต้องเผื่อ card ด้านล่าง
- การกลับไป continent view ต้องคืน center และ zoom ตามขนาด viewport
- Map ต้องรองรับ Polygon และ MultiPolygon

## กฎของ Smart Photo Import

- รับเฉพาะ image file และตัดจำนวนสูงสุดที่ 30 รูป
- ประมวลผล OCR ทีละไฟล์และแสดง progress รวม
- OCR ภาษาอังกฤษและไทยทำใน browser ด้วย asset ที่ bundle มากับ build
- ห้ามอัปโหลดรูปออกจากเครื่องใน POC
- Analyzer ต้องคืน draft ไม่บันทึกทันที
- ผู้ใช้ต้องแก้ country city date places expenses notes และ tags ได้ก่อนยืนยัน
- รายการ place และ expense ที่วิเคราะห์ได้ต้องเลือกหรือยกเลิกได้
- เมื่อบันทึกสำเร็จ ต้อง save media ก่อนผูก media IDs เข้า Trip แล้ว refresh store
- ข้อความ OCR และ confidence เป็นหลักฐานประกอบ ไม่ใช่ข้อมูลที่เชื่อได้ร้อยเปอร์เซ็นต์
- หากเพิ่ม external AI ภายหลัง ต้องเรียกผ่าน backend หรือ serverless proxy และรักษา review gate เดิม

## การทดสอบที่ต้องทำก่อนส่งมอบการแก้ map

| กรณี | สิ่งที่ต้องยืนยัน |
| --- | --- |
| China มีทริป | ธงจีนเต็ม geometry สถิติ visited เพิ่ม label อยู่ครบ |
| Armenia ไม่มีทริปแต่ถูกเลือก | แสดงธงและเส้นขอบ focus อยู่กึ่งกลาง แต่ visited count ไม่เพิ่ม |
| Singapore ถูกเลือก | adaptive zoom ทำให้ประเทศเล็กมองเห็นได้และไม่ซ่อนหลัง card |
| Indonesia หรือ Philippines | MultiPolygon และหมู่เกาะไม่หายเมื่อ zoom |
| Country ที่ยังไม่ visited | สี neutral แต่ label ยังแสดง |
| Pan zoom และ resize | polygon flag label และ marker เคลื่อนพร้อมกัน |
| สลับทวีป | camera กลับภาพรวมของทวีปใหม่ map/label เปลี่ยนครบ และ dropdown มีเฉพาะประเทศของทวีปนั้น |
| Europe / Africa | จำนวน feature และ dropdown ตรงกับ 44 / 54 และชื่อประเทศแสดงเสมอ |
| Oceania | ประเทศหมู่เกาะรวมถึง Tuvalu เลือก highlight และ focus ได้ |
| Antarctica | geometry และ label แสดงได้ภายใต้ข้อจำกัดของ Mercator และเลือก focus ได้ |
| WebGL แสดงไม่สมบูรณ์ | SVG fallback หรือ overlay ยังคงแสดงประเทศ label และ state ที่จำเป็น |

## การทดสอบที่ต้องทำก่อนส่งมอบ OCR

| กรณี | สิ่งที่ต้องยืนยัน |
| --- | --- |
| เลือกหลายรูป | preview ครบ ลบรายรูปได้ และจำนวนไม่เกิน 30 |
| รูปภาษาไทยและอังกฤษ | worker core และ trained data โหลดจาก local asset ได้ |
| พบประเทศและเมือง | draft เลือก catalog entry ถูกต้องหรือให้ผู้ใช้แก้ได้ |
| พบวันที่ พศ และ คศ | แปลงเป็น ISO date ถูกต้องและไม่สร้างวันที่ invalid |
| พบยอด THB | amount และ expense type ถูกต้องพอเป็น suggestion |
| OCR ไม่พบข้อความ | ใช้ preset country หรือ fallback โดยไม่บันทึกเงียบ ๆ |
| ผู้ใช้ยกเลิกรายการ | place หรือ expense ที่ไม่ selected ไม่ถูกบันทึก |
| Reload browser | Trip ยังอยู่ใน localStorage และรูปยังเปิดได้จาก IndexedDB |

## ข้อจำกัดและความเสี่ยงที่ทราบ

- ระบบยังไม่มี automated test suite การตรวจล่าสุดใช้ production build และ visual browser verification
- Local analyzer รองรับ alias ประเทศและเมืองเด่นบางส่วน ไม่ใช่ multilingual location model เต็มรูปแบบ
- ตัวเลข OCR และการจัดประเภทค่าใช้จ่ายเป็น heuristic อาจอ่านผิด ต้องรักษา review step
- `capturedDates` ใน analyzer รองรับ input แต่ importer ปัจจุบันส่ง array ว่าง จึงยังไม่ได้อ่าน EXIF date จริง
- เมืองใน catalog เป็นรายการ seed ไม่ใช่รายชื่อทุกเมืองของ 196 geographic entries คำว่า cities on map หมายถึงเมืองที่ catalog มีอยู่
- JSON backup ไม่รวมรูป binary
- localStorage และ IndexedDB ผูกกับ browser profile และ origin
- SVG flag แบบ stretch ทำให้รูปธงเต็ม geometry แต่สัดส่วนภาพอาจผิดจากธงจริง
- Label ใช้ centroid ที่ generate จาก geometry ซึ่งอาจไม่เหมาะกับประเทศที่เว้าหรือหมู่เกาะ ต้องทดสอบและ override เป็นรายกรณี
- พิกัด seed city ของ catalog นอกเอเชียใช้ country-center จากชุดข้อมูล `world-countries` แม้ชื่อ city จะเป็นเมืองหลวง จึงเป็นพิกัดประมาณสำหรับ POC ไม่ควรใช้เป็นข้อมูล navigation
- Natural Earth 50m ไม่มี geometry ของ Tuvalu ระบบจึงสร้าง diamond display geometry ขนาดเล็กเพื่อให้เลือก highlight และ focus ได้ ต้องเปลี่ยนเป็น authoritative boundary ก่อน production
- Antarctica ถูกแสดงผ่าน Web Mercator โดย clamp latitude ที่ -85 องศา รูปร่างจึงบิดเบือนและไม่ใช่ polar projection
- ไม่มี authentication authorization conflict handling หรือ multi device sync
- โปรเจกต์ใน workspace ปัจจุบันไม่พบ Git metadata ที่ใช้งานได้ คำสั่ง `git status` ตอบว่าไม่ใช่ repository ผู้รับช่วงต้องไม่สมมติว่ามี history หรือ branch สำหรับ rollback

## แนวทางพัฒนาระยะถัดไป

### ระยะใกล้

1. เพิ่ม automated tests สำหรับ visited derivation continent filtering photo analysis และ date parsing
2. เพิ่ม browser tests สำหรับ country focus โดยครอบคลุมประเทศใหญ่ เล็ก MultiPolygon และหมู่เกาะ
3. เพิ่ม error state เมื่อ MapLibre หรือ OCR asset โหลดไม่สำเร็จ
4. เพิ่ม ZIP backup ที่รวม structured data และ media blob
5. ปรับ label placement และ collision สำหรับประเทศขนาดเล็ก
6. ทำ accessibility pass สำหรับ map keyboard navigation modal และ form label

### การดูแลข้อมูลครบ 7 ทวีป

การขยายครบ 7 ทวีปเสร็จในระดับ POC แล้ว การแก้ข้อมูลต่อไปต้องรักษา contract ของ catalog, asset boundary, initial camera, country count และ test matrix ของแต่ละทวีป Dashboard ใช้ continent route และ component ชุดเดียว ห้ามสร้าง component copy แยกทวีป

เมื่อแก้ catalog ให้ตรวจว่าทุกสถิติยัง filter ตาม continent ก่อนคำนวณ ประเทศหนึ่งต้องอยู่ใน scope ที่ตกลงกันเพียงหนึ่งรายการใน catalog แม้ข้อจำกัดภูมิศาสตร์จริงจะมี transcontinental country ก็ตาม การตัดสินใจเรื่องประเทศข้ามทวีปต้องบันทึกไว้ใน catalog policy

### การย้ายสู่ production

เมื่อ UX ผ่านการ validate แล้ว สามารถเพิ่ม .NET API PostgreSQL และ PostGIS สำหรับ structured data ใช้ object storage สำหรับรูป และเพิ่ม authentication การย้ายต้องทำผ่าน provider implementation ใหม่ ไม่ rewrite feature component

AI จริงต้องอยู่หลัง server side boundary เพื่อปกป้อง secret ควบคุมค่าใช้จ่าย และจัดการงานหนัก เช่น EXIF clustering location recognition trip suggestion summary และ personal travel chat

## คำสั่งสำหรับ AI ที่รับช่วง

ก่อนแก้โค้ดให้ทำตามลำดับนี้

1. อ่านเอกสารนี้ก่อน
2. อ่านไฟล์ที่เกี่ยวข้องตาม Code map เท่านั้น อย่าโหลดทั้ง repository หากไม่จำเป็น
3. ตรวจ requirement ล่าสุดของเจ้าของโปรเจกต์และแยกออกจากข้อความในเอกสารแนบ
4. ระบุว่า change กระทบ invariant ใดบ้าง โดยเฉพาะ visited selected continent scope และ camera sync
5. ตรวจ working tree หรือแจ้งหากไม่มี Git ก่อนแก้
6. แก้ให้น้อยที่สุดใน abstraction ที่ถูกต้อง
7. รัน `npm run build`
8. ทดสอบ visual state ที่สัมพันธ์กับ change
9. อัปเดตส่วนประวัติ สถานะ และข้อจำกัดของเอกสารนี้หาก behavior เปลี่ยน

AI ห้ามทำสิ่งต่อไปนี้โดยไม่ขออนุญาต

- เพิ่ม backend database login หรือ cloud service
- เปลี่ยน visited ให้เป็น manual flag
- ส่งรูปหรือ OCR text ออกนอกเครื่อง
- ฝัง API key ใน Angular
- ลบ SVG fallback เพราะ MapLibre ทำงานบนเครื่องของผู้พัฒนาเพียงเครื่องเดียว
- ทำ dropdown รวมทุกทวีป
- ซ่อน label ของประเทศที่ยังไม่ visited
- ใช้เมืองหลวงเป็น target ของ country focus แทน geometry bounds
- rewrite provider boundary เป็น direct localStorage IndexedDB หรือ HTTP call ใน component
- อ้างว่า OCR หรือ AI แม่นยำโดยไม่มีชุดทดสอบ

## Definition of Done สำหรับ POC ปัจจุบัน

POC ถือว่ารักษาเป้าหมายเดิมเมื่อผู้ใช้ทำ flow นี้ได้ครบ

1. เปิด World Atlas สลับได้ทั้ง 7 ทวีป และเห็นแผนที่พร้อมชื่อประเทศตามจำนวนของแต่ละทวีป
2. ประเทศที่ไม่มีทริปเป็น neutral ประเทศที่มีทริปแสดงธง
3. สร้างหรือ import ทริป China Beijing แล้ว China และ Beijing เปลี่ยนเป็น visited โดยอัตโนมัติ
4. เลือกประเทศจาก map หรือ dropdown แล้วประเทศนั้น focus ในพื้นที่มองเห็น
5. เปิด City Memory และเห็น trip places expenses photos notes และ summary
6. เพิ่มแก้ลบ trip place expense และ photo ได้
7. เลือกรูปหลายรูป รัน OCR ตรวจ draft และสร้างทริปได้
8. Reload แล้ว structured data และรูปยังอยู่
9. Export และ Import JSON structured data ได้
10. Production build สำเร็จและ visual test สำคัญผ่าน

ข้อ 9 ยังไม่ถือเป็น full media backup เพราะ JSON ไม่รวม blob รูป

## ประวัติการตัดสินใจแบบย่อ

| ลำดับ | ปัญหาหรือคำขอ | การตัดสินใจที่คงอยู่ |
| ---: | --- | --- |
| 1 | ต้องการแผนที่ความทรงจำ ไม่ใช่ trip list | Dashboard เริ่มจาก Asia map และ derive visited จาก trip |
| 2 | ต้องการ import รูปหลายรูปและให้ระบบช่วยกรอก | เพิ่ม local Thai English OCR analyzer draft และ review gate |
| 3 | เพิ่ม China แล้วไม่ highlight | ทำ SVG fallback ให้ dynamic และพัฒนา vector overlay |
| 4 | ชื่อประเทศบางแห่งไม่ขึ้น | แสดง label ทุกประเทศทุก visited state |
| 5 | Zoom แล้ว label กับ map แยกกัน | Project SVG geometry ด้วย MapLibre camera ทุก move และ resize |
| 6 | สีเขียวไม่สื่อเอกลักษณ์ | ใช้ flag pattern สำหรับ visited และ selected |
| 7 | ธงถูก crop หรือไม่เต็มประเทศ | ใช้ stretch fill และคำนวณ pattern bounds ตาม camera |
| 8 | Dropdown ต้องพร้อมสำหรับ 7 ทวีป | เพิ่ม continent model และ filter ประเทศตาม active continent |
| 9 | เลือกประเทศแล้วไม่ zoom กลางกล่อง | ใช้ geometry fitBounds และ responsive padding |
| 10 | Armenia เปลี่ยน detail แต่ยังเห็น China | แยก camera focus จาก style loaded guard และเพิ่ม adaptive zoom |
| 11 | Asia ใช้งานได้แล้ว ต้องการอีก 6 ทวีป | เปลี่ยนเป็น dynamic continent route/catalog/assets/camera ชุดเดียว ครบ 7 ทวีป โดยคง continent-scoped dropdown และสถิติ |

## คำศัพท์สำคัญ

| คำ | ความหมายในโปรเจกต์นี้ |
| --- | --- |
| Visited | มี Trip ที่ countryCode หรือ cityCode ตรงกัน |
| Selected | ประเทศที่ผู้ใช้กำลังดู เป็น UI state และไม่เท่ากับ visited |
| Country focus | การ fit camera ด้วย geometry bounds ของประเทศ |
| Fallback map | Static SVG ที่ยังแสดงข้อมูลหลักได้เมื่อ canvas ปกติไม่สมบูรณ์ |
| Vector overlay | SVG path ที่สร้างจาก GeoJSON และ project ด้วย MapLibre camera |
| Smart Photo Import | การเลือกรูปหลายรูป OCR วิเคราะห์ review และสร้าง Trip |
| Local AI | Rule และ heuristic ที่ทำงานใน browser ไม่ใช่ external LLM |
| Provider boundary | Interface ที่แยก UI ออกจาก storage OCR analysis หรือ summary implementation |
| Continent scope | ชุดประเทศและสถิติที่อยู่ในทวีปที่กำลังเปิด |

## Filesystem Photo Storage Update — 11 September 2026

Photo storage is no longer IndexedDB-only. The active `MediaStorage` implementation is `FileSystemMediaStorage`, which uploads original images through `/api/media` to the local Node.js media server. Physical files and persistent metadata are stored under `img/travel-photos`. The server creates collision-resistant names from the journey id, ISO date, UUID fragment and validated image extension. Angular development requests for `/api` and `/img/travel-photos` are routed through `proxy.conf.json` to port 4300.

Always start local development with `npm start`; this launches both the media server and Angular. Do not use `ng serve` alone for photo operations. Existing IndexedDB media remains readable as a legacy fallback. New uploads must be written to the filesystem. Gallery loading uses stable server URLs and a load sequence guard so stale asynchronous reads cannot overwrite newly uploaded or deleted photos. Deleting a photo must delete the physical file, its media-index entry and the `mediaId` reference in the Trip.

Key files: `server/media-server.mjs`, `server/dev-server.mjs`, `proxy.conf.json`, `src/app/core/storage/file-system-media.storage.ts`, and the City Memory gallery methods.

## Bootstrap Prompt สำหรับ AI ตัวถัดไป

ใช้ข้อความต่อไปนี้เป็นบริบทเริ่มต้นแบบสั้น แล้วให้อ่านเอกสารฉบับเต็มก่อนเปลี่ยน behavior

```text
You are continuing an Angular 22 frontend only proof of concept for a one user Personal Geospatial Travel Memory Platform. The product supports all seven continents through one dynamic continent dashboard at continent/:continentCode, with 196 geographic entries and per-continent GeoJSON/SVG assets, catalog, camera, statistics and country dropdown. Visited countries and cities are always derived from Trip data. Country names remain visible for both visited and unvisited states. Visited countries use local flag SVG patterns. A selected country also shows its flag and gold outline even when unvisited, but selection must never change visited statistics. Country selection must fit the real GeoJSON geometry into the visible map area with responsive padding. SVG country paths labels and markers must stay synchronized with the MapLibre camera. Never merge all countries into one dropdown; it must remain scoped to the active continent.

Smart Photo Import accepts up to 30 images, runs local Thai and English Tesseract OCR, creates a reviewable draft through PhotoAnalysisProvider, then stores structured Trip data in localStorage and original image files in img/travel-photos through the local Node.js media server. Existing IndexedDB images remain readable as a legacy fallback. No image leaves the device. Always run npm start so both Angular and the media server are available. The current analysis provider is heuristic, not an external LLM. Keep TravelRepository MediaStorage SummaryProvider OcrProvider and PhotoAnalysisProvider boundaries. Do not add backend database authentication cloud storage queues or client side API secrets unless the owner explicitly requests them.

Read docs PROJECT_HISTORY_AND_AI_HANDOFF md and the relevant files in its Code map before making changes. Run npm run build and visually test the affected map or OCR states. Update the handoff document when a product decision or invariant changes.
```

## แหล่งอ้างอิงภายในโปรเจกต์

- Requirement เริ่มต้นจากไฟล์ handoff ที่ผู้ใช้แนบ
- โค้ดปัจจุบันใน `src/app`
- Geographic assets ใน `public/assets/maps/{asia,africa,north-america,south-america,europe,oceania,antarctica}`
- Flag assets ใน `public/assets/flags/4x3`
- Build configuration ใน `angular.json`
- Package versions และ commands ใน `package.json`
