import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/** Keep the dialog inside the visible screen when a phone keyboard opens. */
@Directive({ selector: '[expenseDialogViewport]' })
export class ExpenseDialogViewport {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender({
      write: () => {
        const viewport = window.visualViewport;
        if (!viewport) return;
        const update = () => {
          this.element.nativeElement.style.setProperty('--expense-viewport-height', `${viewport.height}px`);
          this.element.nativeElement.style.setProperty('--expense-viewport-top', `${viewport.offsetTop}px`);
        };
        update();
        viewport.addEventListener('resize', update);
        viewport.addEventListener('scroll', update);
        this.cleanup = () => {
          viewport.removeEventListener('resize', update);
          viewport.removeEventListener('scroll', update);
        };
      },
    });
  }

  private cleanup?: () => void;
  ngOnDestroy(): void { this.cleanup?.(); }
}
