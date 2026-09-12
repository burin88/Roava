import { DestroyRef, Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Driver, DriveStep, driver } from 'driver.js';

@Injectable({ providedIn: 'root' })
export class OnboardingTourService {
  private readonly router = inject(Router);
  private readonly storageKey = 'atlas-showcase-onboarding-v1';
  private tour?: Driver;
  private starting = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.tour?.destroy());
  }

  startIfFirstVisit(): void {
    if (!localStorage.getItem(this.storageKey)) void this.start();
  }

  async start(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    this.tour?.destroy();

    try {
      await this.router.navigate(['/trips']);
      const pageReady = await this.waitForElement('[data-tour="journey-archive"]');
      if (!pageReady) return;

      this.tour = driver({
        animate: true,
        smoothScroll: true,
        allowClose: true,
        allowScroll: true,
        allowKeyboardControl: true,
        disableActiveInteraction: true,
        overlayColor: '#020d17',
        overlayOpacity: 0.84,
        stagePadding: 10,
        stageRadius: 14,
        popoverOffset: 16,
        popoverClass: 'atlas-tour-popover',
        showProgress: true,
        progressText: '{{current}} จาก {{total}}',
        nextBtnText: 'ถัดไป',
        prevBtnText: 'ย้อนกลับ',
        doneBtnText: 'เริ่มใช้งาน',
        steps: this.steps(),
        onDestroyed: () => {
          localStorage.setItem(this.storageKey, '1');
          this.tour = undefined;
        },
      });

      this.tour.drive();
    } finally {
      this.starting = false;
    }
  }

  private steps(): DriveStep[] {
    return [
      {
        popover: {
          title: 'ยินดีต้อนรับสู่ Atlas',
          description: 'มาสร้างคลังความทรงจำจากทุกประเทศ เมือง และการเดินทางของคุณไปทีละขั้นกัน',
        },
      },
      {
        element: '[data-tour="brand"]',
        popover: {
          title: 'กลับสู่คลังการเดินทาง',
          description: 'กดโลโก้ <strong>ATLAS</strong> เมื่อใดก็ได้เพื่อกลับมาหน้า Journeys ซึ่งเป็นหน้าแรกของคุณ',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="journey-archive"]',
        popover: {
          title: '1. คลังการเดินทางของคุณ',
          description: 'หน้า Journeys รวบรวมทุกทริปไว้ในที่เดียว พร้อมสรุปเรื่องราวจากข้อมูลที่คุณบันทึก',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="add-journey"]',
        popover: {
          title: '2. เพิ่มการเดินทางครั้งแรก',
          description: 'กด <strong>+ Add journey</strong> แล้วระบุชื่อทริป ประเทศ เมือง วันที่ รายละเอียด และแท็ก',
          side: 'bottom',
          align: 'end',
        },
      },
      {
        element: '[data-tour="journey-intelligence"]',
        popover: {
          title: '3. ดูภาพรวมการเดินทาง',
          description: 'ส่วนนี้สรุปเรื่องราวจากทริปทั้งหมด และแสดงประเทศที่เคยไปบนลูกโลกแบบโต้ตอบ ลากเพื่อหมุนและเลื่อนเพื่อซูมได้',
          side: 'top',
          align: 'center',
        },
      },
      {
        element: '[data-tour="journey-search"]',
        popover: {
          title: '4. ค้นหาทริปได้ทันที',
          description: 'ค้นหาด้วยชื่อเมือง ประเทศ หรือแท็ก แล้วเปิดการ์ดทริปเพื่อดูความทรงจำ แก้ไข หรือลบข้อมูล',
          side: 'top',
          align: 'center',
        },
      },
      {
        element: '[data-tour="world-atlas-link"]',
        popover: {
          title: 'พร้อมแล้ว!',
          description: 'เปิด <strong>World Atlas</strong> เพื่อสำรวจประเทศและเมือง ดูสถิติ และสำรองข้อมูล คุณกลับมาเปิดคำแนะนำนี้ซ้ำได้จากปุ่ม <strong>วิธีใช้</strong>',
          side: 'bottom',
          align: 'center',
        },
      },
    ];
  }

  private async waitForElement(selector: string, timeoutMs = 5000): Promise<Element | null> {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeoutMs) {
      const element = document.querySelector(selector);
      if (element) return element;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return null;
  }
}
