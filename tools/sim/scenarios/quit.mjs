// Выход: сцены сохраняются (onQuit), фоновая запись мира дожидается, потом процесс завершается сам (и когда
// закрыли окно крестиком) — без «призрака» с окном «не отвечает»
export default async function (t, g) {
  const { engine, scene } = g;
  let saved = 0, exited = null, written = false;
  const origQuit = scene.onQuit.bind(scene);
  scene.onQuit = () => { saved++; origQuit(); };
  engine.hardExit = (code) => { exited = code; };
  engine.beforeExit = [() => new Promise((r) => setTimeout(() => { written = true; r(); }, 50))];
  engine.quit(false); // как крестик окна
  t.check("сцена сохранилась", saved === 1);
  t.check("процесс ещё ждёт фоновую запись", exited === null);
  await new Promise((r) => setTimeout(r, 120));
  t.check("запись дописана — процесс завершён", written && exited === 0);
  engine.quit();
  t.check("второй выход — ничего", saved === 1);
}
