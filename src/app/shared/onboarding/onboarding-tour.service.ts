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
      await this.router.navigate(['/continent', 'AS']);
      const pageReady = await this.waitForElement('[data-tour="continent-switcher"]');
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
          description: 'มาสร้างแผนที่ความทรงจำจากทุกประเทศ เมือง และการเดินทางของคุณไปทีละขั้นกัน',
        },
      },
      {
        element: '[data-tour="brand"]',
        popover: {
          title: 'ศูนย์กลางความทรงจำของคุณ',
          description: 'กดโลโก้ <strong>ATLAS</strong> เมื่อใดก็ได้เพื่อกลับมาดูแผนที่โลกและภาพรวมการเดินทาง',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="continent-switcher"]',
        popover: {
          title: '1. เลือกทวีป',
          description: 'เริ่มจากเลือกทวีปที่ต้องการสำรวจ รายการสถิติและแผนที่จะเปลี่ยนตามพื้นที่ที่เลือก',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '[data-tour="country-search"]',
        popover: {
          title: '2. ค้นหาประเทศ',
          description: 'พิมพ์ชื่อประเทศในช่อง <strong>Search country…</strong> หรือเลือกประเทศจากแผนที่ได้โดยตรง',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="world-map"]',
        popover: {
          title: '3. สำรวจประเทศและเมือง',
          description: 'ลากและซูมแผนที่เพื่อสำรวจ เมื่อเลือกประเทศแล้วให้กดหมุดเมืองเพื่อเปิดหน้าความทรงจำของเมืองนั้น',
          side: 'top',
          align: 'center',
        },
      },
      {
        element: '[data-tour="add-journey"]',
        popover: {
          title: '4. เพิ่มการเดินทาง',
          description: 'กด <strong>+ Add journey</strong> แล้วระบุชื่อทริป ประเทศ เมือง วันที่ รายละเอียด และแท็ก ประเทศนั้นจะสว่างขึ้นบนแผนที่',
          side: 'bottom',
          align: 'end',
        },
      },
      {
        element: '[data-tour="local-backup"]',
        popover: {
          title: '5. สำรองข้อมูลของคุณ',
          description: 'ข้อมูลเก็บอยู่ในเบราว์เซอร์เครื่องนี้ ใช้ <strong>Export data</strong> สำรองไฟล์ และ <strong>Import data</strong> เพื่อนำกลับมาใช้ภายหลัง',
          side: 'top',
          align: 'end',
        },
      },
      {
        element: '[data-tour="journeys-link"]',
        popover: {
          title: 'พร้อมแล้ว!',
          description: 'เปิดหน้า <strong>Journeys</strong> เพื่อค้นหา ดู แก้ไข หรือลบทริปทั้งหมด คุณกลับมาเปิดคำแนะนำนี้ซ้ำได้จากปุ่ม <strong>วิธีใช้</strong>',
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
