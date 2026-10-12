// ============================================================
//  Захват мыши для обзора: capture() — курсор пропадает, движения мыши крутят камеру.
//  Когда захватывать и отпускать, решает игра (в меню курсор нужен свободным).
//
//  Два способа — какой есть в библиотеке окна (@kmamal/sdl):
//
//   1. «Относительный режим» (SDL3, @kmamal/sdl 1.x) — как в настоящих играх.
//      Курсор отцепляется от мыши и стоит на месте, а игра получает только
//      сдвиги мыши (dx, dy). Система не видит, что «курсор быстро двигается», —
//      значит, на Маке не срабатывает «встряхни, чтобы найти указатель»
//      (курсор раздувался при быстром повороте камеры).
//
//   2. Запасной (SDL2, @kmamal/sdl 0.11): прячем курсор и после каждого движения
//      возвращаем его в центр окна. Работает везде, но для системы курсор
//      всё время прыгает — на Маке он может раздуваться.
// ============================================================

import sdl from "@kmamal/sdl";

export class MouseLook {
  constructor(window, sensitivity = 0.0025) {
    this.window = window;
    this.sensitivity = sensitivity; // радиан на точку экрана
    this.captured = false;
    this.dx = 0;
    this.dy = 0;
    this.last = null;
    this.relative = typeof window.setRelativeMouseMode === "function"; // есть ли способ 1

    window.on("mouseMove", (e) => {
      if (!this.captured) return;
      if (this.relative) {
        // Способ 1: библиотека сама даёт сдвиг мыши
        this.dx += e.dx || 0;
        this.dy += e.dy || 0;
        return;
      }
      // Способ 2: сдвиг = где курсор сейчас минус центр, куда мы его вернули
      if (this.last) {
        this.dx += e.x - this.last.x;
        this.dy += e.y - this.last.y;
      }
      this.recenter();
    });
  }

  center() {
    return { x: Math.floor(this.window.width / 2), y: Math.floor(this.window.height / 2) };
  }

  // Вернуть курсор в центр окна (setPosition ждёт координаты экрана, а не окна)
  recenter() {
    const c = this.center();
    sdl.mouse.setPosition(this.window.x + c.x, this.window.y + c.y);
    this.last = c;
  }

  capture() {
    if (this.captured) return;
    this.captured = true;
    this.dx = this.dy = 0;
    if (this.relative) {
      this.window.setRelativeMouseMode(true); // курсор скрыт и стоит на месте
      return;
    }
    sdl.mouse.showCursor(false);
    this.recenter();
  }

  release() {
    if (!this.captured) return;
    this.captured = false;
    this.last = null;
    if (this.relative) {
      this.window.setRelativeMouseMode(false);
      return;
    }
    sdl.mouse.showCursor(true);
  }

  // Сколько повернуть камеру с прошлого кадра (в радианах)
  consume() {
    const d = { dx: this.dx * this.sensitivity, dy: this.dy * this.sensitivity };
    this.dx = this.dy = 0;
    return d;
  }
}
