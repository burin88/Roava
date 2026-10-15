export type ItineraryStop = { time: string; name: string; detail?: string; metro?: string };
export type ItineraryDay = { number: number; date: string; weekday: string; color: string; title: string; subtitle: string; weather: string; temperature: string; forecast: string; image: string; imageLabel: string; stops: ItineraryStop[]; tip?: string };

export const BEIJING_ITINERARY: ItineraryDay[] = [
    { number: 1, date: '29/10', weekday: 'พฤหัสบดี', color: '#c83d40', title: 'สวัสดี… ปักกิ่ง!', subtitle: 'Lama Temple · Beihai Park · Sanlitun', weather: '🌤️', temperature: '10–19°', forecast: 'มีเมฆบางส่วน เย็นสบาย', image: 'city', imageLabel: 'พระราชวังและสถาปัตยกรรมใจกลางปักกิ่ง', stops: [
      { time: '06:50', name: 'ถึงสนามบินปักกิ่ง (PEK)', detail: 'เที่ยวบินจากกรุงเทพฯ · เตรียมพร้อมออกเดินทาง' },
      { time: '08:00', name: 'เข้าเมือง & ฝากกระเป๋า', detail: 'Didi ประมาณ 45–60 นาที · Crystal Orange Sanlitun / Taikoo Li Beijing' },
      { time: '10:00', name: 'วัดลามะ (Lama Temple)', metro: 'Line 2 · Yonghegong' },
      { time: '12:30', name: 'รับประทานอาหารกลางวัน' },
      { time: '14:00', name: 'อุทยานเป่ยไห่ (Beihai Park)', metro: 'Line 6 · Beihai North' },
      { time: '16:30', name: 'Yuan Gu Ben Dian', detail: 'คาเฟ่ในย่านหูถงสุดคลาสสิก' },
      { time: '19:00', name: 'Long Time Ago หรือ Rhapsody', detail: 'มื้อค่ำ ก่อนเดินเล่น Sanlitun / Taikoo Li เวลา 20:30' },
    ] },
    { number: 2, date: '30/10', weekday: 'ศุกร์', color: '#b96a28', title: 'เหนือกำแพง… ใต้ใบไม้สีทอง', subtitle: 'Mutianyu Great Wall · Yan Wai Yan', weather: '☀️', temperature: '8–19°', forecast: 'เย็น ลมแรงบนกำแพง', image: 'wall', imageLabel: 'กำแพงเมืองจีนท่ามกลางขุนเขา', stops: [
      { time: '06:30', name: 'ออกจากโรงแรม', detail: 'แนะนำเดินทางแบบเช้า · Didi ประมาณ 1.5–2 ชั่วโมง หรือ MRT + รถต่อ' },
      { time: '09:00', name: 'ถึง Mutianyu Great Wall', detail: 'ขึ้นกระเช้า Cable Car · เดินบนกำแพง · ลงสไลเดอร์ Toboggan' },
      { time: '13:00', name: 'รับประทานอาหารกลางวัน', detail: 'บริเวณใกล้เคียงกำแพงเมืองจีน' },
      { time: '14:30', name: 'เดินทางกลับปักกิ่ง', detail: 'เดินทางด้วย Didi' },
      { time: '17:30', name: 'กลับโรงแรม / พัก / อาบน้ำ' },
      { time: '19:00', name: 'Yan Wai Yan Beijing', detail: 'กินข้าว + ใส่ชุดจีน · ถ่ายรูป + ชมการแสดง' },
    ], tip: 'แนะนำจองตั๋วล่วงหน้า โดยเฉพาะช่วงไฮซีซั่น' },
    { number: 3, date: '31/10', weekday: 'เสาร์', color: '#347aaa', title: 'หนึ่งวันในเมืองจักรพรรดิ', subtitle: 'Forbidden City · Jingshan · Shichahai', weather: '☀️', temperature: '10–20°', forecast: 'แจ่มใส อากาศดี', image: 'city', imageLabel: 'พระราชวังต้องห้าม กรุงปักกิ่ง', stops: [
      { time: '08:00', name: 'พระราชวังต้องห้าม', detail: 'Forbidden City · เดินต่อประมาณ 10 นาที', metro: 'Line 1 · Tiananmen East' },
      { time: '12:00', name: 'รับประทานอาหารกลางวัน', detail: 'แนะนำโซน Qianmen 前门' },
      { time: '13:30', name: 'สวนสาธารณะจิ่งซาน', detail: 'Jingshan Park · ชมวิวเมืองปักกิ่งด้านหลังพระราชวังต้องห้าม' },
      { time: '16:30', name: 'ทะเลสาบสือช่าไห่', detail: 'Shichahai · เดินเล่น ชมบรรยากาศ ร้านกาแฟ ร้านค้า ย่านหูถง' },
      { time: '19:00', name: 'รับประทานอาหารเย็น' },
      { time: '21:00', name: 'กลับโรงแรม / พักผ่อน' },
    ], tip: 'จองเข้าพระราชวังล่วงหน้า และพกพาสปอร์ตตัวจริง' },
    { number: 4, date: '01/11', weekday: 'อาทิตย์', color: '#38846c', title: 'สวนหลวง & แสงสีเมืองใหญ่', subtitle: 'Summer Palace · Temple of Heaven', weather: '☀️', temperature: '3–15°', forecast: 'หนาวช่วงเช้าและค่ำ', image: 'palace', imageLabel: 'ภาพบรรยากาศพระราชวังและคูน้ำในปักกิ่ง', stops: [
      { time: '08:30', name: 'พระราชวังฤดูร้อน', detail: 'Summer Palace', metro: 'Line 4 · Beigongmen' },
      { time: '12:00', name: 'รับประทานอาหารกลางวัน' },
      { time: '14:00', name: 'หอสักการะฟ้า', detail: 'Temple of Heaven', metro: 'Line 5 · Tiantan East' },
      { time: '16:00', name: 'Wangfujing Walking Street', metro: 'Line 1 · Wangfujing' },
      { time: '18:00', name: 'ช้อปปิ้ง / รับประทานอาหารเย็น' },
      { time: '20:00', name: 'กลับโรงแรม' },
    ] },
    { number: 5, date: '02/11', weekday: 'จันทร์', color: '#8362a6', title: 'ปล่อยใจให้สนุกทั้งวัน', subtitle: 'Universal Beijing Resort', weather: '☁️', temperature: '6–12°', forecast: 'เริ่มหนาว ช่วงเช้า–ค่ำเย็นมาก', image: '', imageLabel: '', stops: [
      { time: '08:00', name: 'ออกจากโรงแรม', detail: 'Didi ประมาณ 1–1.5 ชั่วโมง หรือ MRT + รถต่อ' },
      { time: '09:30', name: 'Universal Beijing Resort', detail: 'สนุกกับเครื่องเล่นและโซนต่าง ๆ เต็มวัน' },
      { time: 'ห้ามพลาด', name: 'โลกแห่งภาพยนตร์ที่คุณรัก', detail: 'Harry Potter · Transformers · Minions · Jurassic World · Kung Fu Panda' },
      { time: '19:00', name: 'เดินทางกลับโรงแรม', detail: 'Didi หรือ MRT + รถต่อ' },
    ], tip: 'ใส่รองเท้าที่เดินสบาย และเตรียมแบตสำรองให้พร้อม' },
    { number: 6, date: '03/11', weekday: 'อังคาร', color: '#357da7', title: 'เจอแพนด้า… แล้วไปเทียนจิน', subtitle: 'Beijing Zoo · Tianjin day trip', weather: '☀️', temperature: '2–12°', forecast: 'หนาว ลมแรง', image: '', imageLabel: '', stops: [
      { time: '08:00', name: 'ออกจากโรงแรม' },
      { time: '09:00', name: 'สวนสัตว์ปักกิ่ง (Beijing Zoo)', detail: 'ชมแพนด้า Panda House และสัตว์น่ารักมากมาย · ถึง 12:30' },
      { time: '12:30', name: 'รับประทานอาหารกลางวัน' },
      { time: '14:45', name: 'เดินทางไปสถานี Beijing South', detail: 'ประมาณ 30–40 นาที' },
      { time: '16:00', name: 'รถไฟความเร็วสูงไป Tianjin', detail: 'ประมาณ 30–40 นาที · ถึงราว 16:30–17:00' },
      { time: '17:00', name: 'Italian Style Town', detail: 'เดินเล่น ถ่ายรูป ชมสถาปัตยกรรมยุโรป' },
      { time: '19:00', name: 'Tianjin Eye', detail: 'ชมวิวแสงไฟยามค่ำคืน' },
      { time: '21:30', name: 'นั่งรถไฟกลับปักกิ่ง', detail: 'ประมาณ 30–40 นาที · กลับถึงหลัง 22:15 ตามรอบรถจริง' },
    ] },
    { number: 7, date: '04/11', weekday: 'พุธ', color: '#c83d40', title: 'เก็บความทรงจำ… ก่อนกลับบ้าน', subtitle: '798 Art District · Qianmen · Departure', weather: '☁️', temperature: '4–11°', forecast: 'หนาว โดยเฉพาะช่วงเช้าและเย็น', image: '', imageLabel: '', stops: [
      { time: '08:30', name: '798 Art District', metro: 'Line 14 · Wangjing South' },
      { time: '11:30', name: 'รับประทานอาหารกลางวัน' },
      { time: '13:00', name: 'Qianmen Walking Street', detail: 'และย่าน Dashilan · แวะซื้อของฝาก เดินเล่นย่านประวัติศาสตร์', metro: 'Line 7 · Qianmen' },
      { time: '15:00', name: 'เดินทางไปสนามบิน', detail: 'ควรถึงสนามบินช่วง 15:00–16:00 เผื่อเวลาเช็กอินและตรวจเอกสาร' },
      { time: '19:00', name: 'ออกเดินทางกลับกรุงเทพฯ ✈', detail: 'จบทริปปักกิ่ง พร้อมความทรงจำดี ๆ' },
    ], tip: 'เช็กอาคารผู้โดยสารและรายละเอียดเที่ยวบินก่อนออกเดินทาง' },
  ];
